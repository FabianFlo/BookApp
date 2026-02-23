import { Injectable } from '@angular/core';
import {
    CapacitorSQLite,
    SQLiteConnection,
    SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

@Injectable({ providedIn: 'root' })
export class DatabaseService {
    private sqlite: SQLiteConnection;
    private db!: SQLiteDBConnection;
    private dbName = 'books_db';
    private initialized = false;

    constructor() {
        this.sqlite = new SQLiteConnection(CapacitorSQLite);
    }

    async init(): Promise<void> {
        if (this.initialized) return;
        try {
            if (Capacitor.getPlatform() === 'web') {
                await customElements.whenDefined('jeep-sqlite');
                await new Promise(resolve => setTimeout(resolve, 500));
                const jeepEl = document.querySelector('jeep-sqlite');
                if (!jeepEl) throw new Error('jeep-sqlite no encontrado en DOM');
                await this.sqlite.initWebStore();
            }

            this.db = await this.sqlite.createConnection(
                this.dbName, false, 'no-encryption', 1, false
            );
            await this.db.open();
            await this.createTables();
            this.initialized = true;
            console.log('SQLite listo');
        } catch (error) {
            console.error('Error inicializando SQLite:', error);
            this.initialized = false;
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

      CREATE TABLE IF NOT EXISTS cached_book_detail (
        work_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS custom_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );

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
        if (!this.initialized) return;
        const now = Date.now();
        await this.db.run(`
      INSERT INTO cached_books (genre, page, payload, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(genre, page) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at;
    `, [genre, page, payload, now]);
    }

    async getCachedBooks(genre: string, page: number): Promise<string | null> {
        if (!this.initialized) return null;
        const res = await this.db.query(
            `SELECT payload FROM cached_books WHERE genre=? AND page=? LIMIT 1`,
            [genre, page]
        );
        return res.values?.[0]?.payload ?? null;
    }

    async hasAnyCacheForGenre(genre: string): Promise<boolean> {
        if (!this.initialized) return false;
        const res = await this.db.query(
            `SELECT COUNT(1) as c FROM cached_books WHERE genre=?`,
            [genre]
        );
        return Number(res.values?.[0]?.c ?? 0) > 0;
    }

    // ─── CACHE DETALLE LIBRO ──────────────────────────────────────────────────

    async upsertCachedBookDetail(workKey: string, payload: string): Promise<void> {
        if (!this.initialized) return;
        const now = Date.now();
        await this.db.run(`
      INSERT INTO cached_book_detail (work_key, payload, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(work_key) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at;
    `, [workKey, payload, now]);
    }

    async getCachedBookDetail(workKey: string): Promise<string | null> {
        if (!this.initialized) return null;
        const res = await this.db.query(
            `SELECT payload FROM cached_book_detail WHERE work_key=? LIMIT 1`,
            [workKey]
        );
        return res.values?.[0]?.payload ?? null;
    }

    // ─── LISTAS PERSONALIZADAS ────────────────────────────────────────────────

    async getLists(): Promise<{ id: number; name: string; created_at: number }[]> {
        if (!this.initialized) return [];
        const res = await this.db.query(
            `SELECT id, name, created_at FROM custom_lists ORDER BY created_at ASC`
        );
        return res.values ?? [];
    }

    async createList(name: string): Promise<void> {
        if (!this.initialized) return;
        await this.db.run(
            `INSERT INTO custom_lists (name, created_at) VALUES (?, ?)`,
            [name.trim(), Date.now()]
        );
    }

    async renameList(id: number, name: string): Promise<void> {
        if (!this.initialized) return;
        await this.db.run(
            `UPDATE custom_lists SET name=? WHERE id=?`,
            [name.trim(), id]
        );
    }

    async deleteList(id: number): Promise<void> {
        if (!this.initialized) return;
        await this.db.run(`DELETE FROM custom_lists WHERE id=?`, [id]);
    }

    // ─── LIBROS EN LISTAS ─────────────────────────────────────────────────────

    async getBooksInList(listId: number): Promise<any[]> {
        if (!this.initialized) return [];
        const res = await this.db.query(
            `SELECT * FROM list_books WHERE list_id=? ORDER BY added_at DESC`,
            [listId]
        );
        return res.values ?? [];
    }

    async addBookToList(listId: number, book: {
        work_key: string;
        title: string;
        author?: string;
        cover_id?: number;
        first_publish_year?: number;
    }): Promise<'added' | 'duplicate'> {
        if (!this.initialized) return 'duplicate';
        try {
            await this.db.run(`
        INSERT INTO list_books (list_id, work_key, title, author, cover_id, first_publish_year, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
                listId,
                book.work_key,
                book.title,
                book.author ?? null,
                book.cover_id ?? null,
                book.first_publish_year ?? null,
                Date.now()
            ]);
            return 'added';
        } catch {
            return 'duplicate';
        }
    }

    async removeBookFromList(listId: number, workKey: string): Promise<void> {
        if (!this.initialized) return;
        await this.db.run(
            `DELETE FROM list_books WHERE list_id=? AND work_key=?`,
            [listId, workKey]
        );
    }

    async isBookInList(listId: number, workKey: string): Promise<boolean> {
        if (!this.initialized) return false;
        const res = await this.db.query(
            `SELECT COUNT(1) as c FROM list_books WHERE list_id=? AND work_key=?`,
            [listId, workKey]
        );
        return Number(res.values?.[0]?.c ?? 0) > 0;
    }
}