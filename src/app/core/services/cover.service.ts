import { Injectable } from '@angular/core';
import { DatabaseService } from './database.service';

@Injectable({ providedIn: 'root' })
export class CoverService {

    constructor(private db: DatabaseService) { }

    private async blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject();
            reader.onload = () => {
                const result = reader.result as string;
                resolve(result);
            };
            reader.readAsDataURL(blob);
        });
    }

    async getCoverUrl(coverId?: number | null): Promise<string> {
        if (!coverId) return 'assets/no-cover.png';

        // 1. Siempre buscar en cache SQLite primero
        try {
            const cached = await this.db.getCover(coverId);
            if (cached) return cached;
        } catch {
            // si falla la db, continuar
        }

        // 2. Sin conexión y sin cache → fallback
        if (!navigator.onLine) return 'assets/no-cover.png';

        // 3. Con conexión → intentar descargar con timeout
        try {
            const url = `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);

            const response = await fetch(url, {
                signal: controller.signal,
                redirect: 'follow'
            });

            clearTimeout(timeoutId);

            if (!response.ok) return 'assets/no-cover.png';

            // Verificar que realmente es una imagen
            const contentType = response.headers.get('content-type') ?? '';
            if (!contentType.includes('image')) return 'assets/no-cover.png';

            const blob = await response.blob();
            if (blob.size < 500) return 'assets/no-cover.png'; // imagen vacía/rota

            const base64 = await this.blobToBase64(blob);

            // Guardar en cache para uso offline
            await this.db.upsertCover(coverId, base64);

            return base64;

        } catch {
            // Timeout, red caída, o cualquier error → fallback silencioso
            return 'assets/no-cover.png';
        }
    }
}