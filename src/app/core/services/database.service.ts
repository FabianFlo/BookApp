import { Injectable } from '@angular/core';
import {
    CapacitorSQLite,
    SQLiteConnection,
    SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

type DbList = { id: number; name: string; created_at: number };

@Injectable({ providedIn: 'root' })
export class DatabaseService {
    private sqlite: SQLiteConnection;
    private db!: SQLiteDBConnection;

    private readonly dbName = 'books_db';
    private initialized = false;
    private initPromise: Promise<void> | null = null;

    constructor() {
        this.sqlite = new SQLiteConnection(CapacitorSQLite);
    }

    /** Asegura init 1 sola vez (lock) */
    async init(): Promise<void> {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                if (Capacitor.getPlatform() === 'web') {
                    await customElements.whenDefined('jeep-sqlite');
                    // Pequeño delay para que el custom element quede funcional en dev-server
                    await new Promise((r) => setTimeout(r, 250));
                    const jeepEl = document.querySelector('jeep-sqlite');
                    if (!jeepEl) throw new Error('jeep-sqlite no encontrado en DOM');
                    await this.sqlite.initWebStore();
                }

                // Importante: createConnection + open SIEMPRE antes de execute
                this.db = await this.sqlite.createConnection(
                    this.dbName,
                    false,
                    'no-encryption',
                    1,
                    false
                );

                await this.db.open();
                await this.createTables();
                await this.db.execute(`PRAGMA foreign_keys = ON;`);

                this.initialized = true;
                console.log('SQLite listo');
            } catch (error) {
                console.error('Error inicializando SQLite:', error);
                this.initialized = false;
                throw error;
            } finally {
                this.initPromise = null;
            }
        })();

        return this.initPromise;
    }

    private async ensureReady(): Promise<void> {
        if (!this.initialized) {
            await this.init();
        }
    }

    private async createTables(): Promise<void> {
        await this.db.execute(`
      CREATE TABLE IF NOT EXISTS cached_books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        genre TEXT NOT NULL,
        page INTEGER NOT NULL,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(genre, page)
      );
    `);

        await this.db.execute(`
      CREATE TABLE IF NOT EXISTS cached_book_detail (
        work_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

        await this.db.execute(`
      CREATE TABLE IF NOT EXISTS custom_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );
    `);

        await this.db.execute(`
      CREATE TABLE IF NOT EXISTS list_books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        list_id INTEGER NOT NULL,
        work_key TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT,
        cover_id INTEGER,
        first_publish_year INTEGER,
        added_at INTEGER NOT NULL,
        FOREIGN KEY (list_id) REFERENCES custom_lists(id) ON DELETE CASCADE,
        UNIQUE(list_id, work_key)
      );
    `);
    }

    // ─── CACHE GÉNEROS ────────────────────────────────────────────────────────

    async upsertCachedBooks(genre: string, page: number, payload: string): Promise<void> {
        await this.ensureReady();
        const now = Date.now();

        await this.db.run(
            `
      INSERT INTO cached_books (genre, page, payload, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(genre, page) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at;
      `,
            [genre, page, payload, now]
        );
    }

    async getCachedBooks(genre: string, page: number): Promise<string | null> {
        await this.ensureReady();
        const res = await this.db.query(
            `SELECT payload FROM cached_books WHERE genre=? AND page=? LIMIT 1`,
            [genre, page]
        );
        return (res.values?.[0] as any)?.payload ?? null;
    }

    async hasAnyCacheForGenre(genre: string): Promise<boolean> {
        await this.ensureReady();
        const res = await this.db.query(
            `SELECT COUNT(1) as c FROM cached_books WHERE genre=?`,
            [genre]
        );
        return Number((res.values?.[0] as any)?.c ?? 0) > 0;
    }

    async isCachedBooksFresh(genre: string, page: number, maxAgeMs: number): Promise<boolean> {
        await this.ensureReady();
        const res = await this.db.query(
            `SELECT updated_at FROM cached_books WHERE genre=? AND page=? LIMIT 1`,
            [genre, page]
        );
        const ts = Number((res.values?.[0] as any)?.updated_at ?? 0);
        if (!ts) return false;
        return Date.now() - ts <= maxAgeMs;
    }

    // ─── CACHE DETALLE LIBRO ──────────────────────────────────────────────────

    async upsertCachedBookDetail(workKey: string, payload: string): Promise<void> {
        await this.ensureReady();
        const now = Date.now();

        await this.db.run(
            `
      INSERT INTO cached_book_detail (work_key, payload, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(work_key) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at;
      `,
            [workKey, payload, now]
        );
    }

    async getCachedBookDetail(workKey: string): Promise<string | null> {
        await this.ensureReady();
        const res = await this.db.query(
            `SELECT payload FROM cached_book_detail WHERE work_key=? LIMIT 1`,
            [workKey]
        );
        return (res.values?.[0] as any)?.payload ?? null;
    }

    async isCachedBookDetailFresh(workKey: string, maxAgeMs: number): Promise<boolean> {
        await this.ensureReady();
        const res = await this.db.query(
            `SELECT updated_at FROM cached_book_detail WHERE work_key=? LIMIT 1`,
            [workKey]
        );
        const ts = Number((res.values?.[0] as any)?.updated_at ?? 0);
        if (!ts) return false;
        return Date.now() - ts <= maxAgeMs;
    }

    // ─── LISTAS PERSONALIZADAS ────────────────────────────────────────────────

    async getLists(): Promise<DbList[]> {
        await this.ensureReady();
        const res = await this.db.query(
            `SELECT id, name, created_at FROM custom_lists ORDER BY created_at ASC`
        );
        return (res.values as any) ?? [];
    }

    async createList(name: string): Promise<void> {
        await this.ensureReady();
        await this.db.run(
            `INSERT INTO custom_lists (name, created_at) VALUES (?, ?)`,
            [name.trim(), Date.now()]
        );
    }

    async renameList(id: number, name: string): Promise<void> {
        await this.ensureReady();
        await this.db.run(`UPDATE custom_lists SET name=? WHERE id=?`, [name.trim(), id]);
    }

    async deleteList(id: number): Promise<void> {
        await this.ensureReady();
        await this.db.run(`DELETE FROM custom_lists WHERE id=?`, [id]);
    }

    // ─── LIBROS EN LISTAS ─────────────────────────────────────────────────────

    async getBooksInList(listId: number): Promise<any[]> {
        await this.ensureReady();
        const res = await this.db.query(
            `SELECT * FROM list_books WHERE list_id=? ORDER BY added_at DESC`,
            [listId]
        );
        return (res.values as any) ?? [];
    }

    async addBookToList(
        listId: number,
        book: {
            work_key: string;
            title: string;
            author?: string;
            cover_id?: number;
            first_publish_year?: number;
        }
    ): Promise<'added' | 'duplicate'> {
        await this.ensureReady();
        try {
            await this.db.run(
                `
        INSERT INTO list_books (list_id, work_key, title, author, cover_id, first_publish_year, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
                [
                    listId,
                    book.work_key,
                    book.title,
                    book.author ?? null,
                    book.cover_id ?? null,
                    book.first_publish_year ?? null,
                    Date.now(),
                ]
            );
            return 'added';
        } catch {
            return 'duplicate';
        }
    }

    async removeBookFromList(listId: number, workKey: string): Promise<void> {
        await this.ensureReady();
        await this.db.run(`DELETE FROM list_books WHERE list_id=? AND work_key=?`, [
            listId,
            workKey,
        ]);
    }

    async isBookInList(listId: number, workKey: string): Promise<boolean> {
        await this.ensureReady();
        const res = await this.db.query(
            `SELECT COUNT(1) as c FROM list_books WHERE list_id=? AND work_key=?`,
            [listId, workKey]
        );
        return Number((res.values?.[0] as any)?.c ?? 0) > 0;
    }
}