// src/app/services/preload.service.ts
import { Injectable } from '@angular/core';
import { DatabaseService } from './database.service';
import { ApiService } from './api.service';

type PreloadStatus =
    | { state: 'idle' }
    | { state: 'running'; progress: number; total: number; message?: string }
    | { state: 'done'; cachedPages: number; cachedDetails: number }
    | { state: 'error'; error: any };

@Injectable({ providedIn: 'root' })
export class PreloadService {
    private readonly GENRES = ['fiction', 'fantasy', 'romance', 'mystery'];
    private readonly PAGES_PER_GENRE = 3;

    // TTL (ej: 7 días)
    private readonly TTL_MS = 7 * 24 * 60 * 60 * 1000;

    // Control de concurrencia para detalles
    private readonly DETAIL_CONCURRENCY = 5;

    private running = false;
    status: PreloadStatus = { state: 'idle' };

    constructor(private db: DatabaseService, private api: ApiService) { }

    /** Detecta conectividad realista (simple y suficiente) */
    private isOnline(): boolean {
        return typeof navigator !== 'undefined' ? navigator.onLine : true;
    }

    /** Arranca precarga: NO bloquea UI, y no corre 2 veces al mismo tiempo */
    async preloadInitialData(): Promise<void> {
        if (this.running) return;
        if (!this.isOnline()) return;

        this.running = true;
        this.status = { state: 'running', progress: 0, total: 1, message: 'Iniciando DB...' };

        try {
            await this.db.init();

            // Total “estimado” para mostrar progreso (páginas + detalles aproximados)
            // 4 géneros * 3 páginas = 12 páginas
            // 12 páginas * 5 libros = 60 detalles (aprox)
            const totalPages = this.GENRES.length * this.PAGES_PER_GENRE;
            const totalEstimatedDetails = totalPages * 5;
            const total = totalPages + totalEstimatedDetails;

            let done = 0;
            let cachedPages = 0;
            let cachedDetails = 0;

            const bump = (msg?: string) => {
                done++;
                this.status = {
                    state: 'running',
                    progress: done,
                    total,
                    message: msg,
                };
            };

            // 1) Precargar páginas de género (secuencial, es poco)
            const workKeysToFetch = new Set<string>();

            for (const genre of this.GENRES) {
                for (let page = 1; page <= this.PAGES_PER_GENRE; page++) {
                    const fresh = await this.db.isCachedBooksFresh(genre, page, this.TTL_MS);
                    if (fresh) {
                        cachedPages++;
                        bump(`Cache OK: ${genre} p${page}`);
                        // Igual intentamos sacar workKeys desde cache para no depender del fetch
                        const cached = await this.db.getCachedBooks(genre, page);
                        if (cached) {
                            this.extractWorkKeys(JSON.parse(cached), workKeysToFetch);
                        }
                        continue;
                    }

                    try {
                        const payloadObj = await this.api.getBooksByGenreOnce(genre, page);
                        const payloadStr = JSON.stringify(payloadObj);
                        await this.db.upsertCachedBooks(genre, page, payloadStr);
                        cachedPages++;
                        bump(`Guardado: ${genre} p${page}`);

                        this.extractWorkKeys(payloadObj, workKeysToFetch);
                    } catch (e) {
                        // No tiramos la app por 1 página
                        bump(`Falló: ${genre} p${page}`);
                        console.warn('Preload page failed', { genre, page, e });
                    }
                }
            }

            // 2) Precargar detalles (con concurrencia)
            const workKeys = Array.from(workKeysToFetch);

            // Si vinieron menos/más de 60 da lo mismo: cacheamos los que existan
            await this.runPool(workKeys, this.DETAIL_CONCURRENCY, async (workKey) => {

                const isFresh = await this.db.isCachedBookDetailFresh(workKey, this.TTL_MS);
                if (isFresh) {
                    cachedDetails++;
                    bump(`Detalle OK: ${workKey}`);
                    return;
                }

                try {

                    const work: any = await this.api.getBookDetailOnce(workKey);

                    const subjects = Array.isArray(work?.subjects)
                        ? work.subjects.slice(0, 8)
                        : [];

                    const authorKeys: string[] = (work?.authors || [])
                        .map((a: any) => a?.author?.key)
                        .filter(Boolean);

                    let authorNames: string[] = [];

                    for (const key of authorKeys) {
                        try {
                            const author = await this.api.getAuthorDetailOnce(key);
                            authorNames.push(author?.name || 'Autor desconocido');
                        } catch {
                            authorNames.push('Autor desconocido');
                        }
                    }

                    const payload = {
                        work,
                        authorNames,
                        subjects
                    };

                    await this.db.upsertCachedBookDetail(
                        workKey,
                        JSON.stringify(payload)
                    );

                    cachedDetails++;
                    bump(`Detalle guardado: ${workKey}`);

                } catch (e) {
                    bump(`Detalle falló: ${workKey}`);
                    console.warn('Preload detail failed', { workKey, e });
                }
            });

            this.status = { state: 'done', cachedPages, cachedDetails };
        } catch (error) {
            console.error('Preload error:', error);
            this.status = { state: 'error', error };
        } finally {
            this.running = false;
        }
    }

    /**
     * Intenta encontrar work keys de OpenLibrary desde una respuesta genérica.
     * Soporta payloads tipo: { works: [...] } o { entries: [...] } etc.
     */
    private extractWorkKeys(payloadObj: any, sink: Set<string>) {
        const list =
            payloadObj?.works ??
            payloadObj?.entries ??
            payloadObj?.docs ??
            payloadObj?.items ??
            [];

        if (!Array.isArray(list)) return;

        for (const item of list) {
            // Work key puede venir como:
            // item.key => "/works/OLxxxxW"
            // item.work_key => "/works/..."
            const wk = item?.work_key ?? item?.key ?? null;
            if (typeof wk === 'string' && wk.includes('/works/')) {
                sink.add(wk);
            }
        }
    }

    /** Pool runner simple para concurrencia limitada */
    private async runPool<T>(
        items: T[],
        concurrency: number,
        worker: (item: T) => Promise<void>
    ): Promise<void> {
        let idx = 0;

        const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
            while (idx < items.length) {
                const current = items[idx++];
                await worker(current);
            }
        });

        await Promise.all(runners);
    }
}