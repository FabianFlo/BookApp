import { Injectable } from '@angular/core';
import {
    CapacitorSQLite,
    SQLiteConnection,
    SQLiteDBConnection,
} from '@capacitor-community/sqlite';

@Injectable({ providedIn: 'root' })
export class DatabaseService {
    private sqlite: SQLiteConnection;
    private db!: SQLiteDBConnection;
    private dbName = 'books_db';

    constructor() {
        this.sqlite = new SQLiteConnection(CapacitorSQLite);
    }

    async init(): Promise<void> {
        this.db = await this.sqlite.createConnection(
            this.dbName,
            false,
            'no-encryption',
            1,
            false
        );
        await this.db.open();
        await this.createTables();
    }

    private async createTables(): Promise<void> {
        const sql = `
      CREATE TABLE IF NOT EXISTS cached_books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        genre TEXT NOT NULL,
        page INTEGER NOT NULL,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(genre, page)
      );
    `;
        await this.db.execute(sql);
    }

    async upsertCachedBooks(genre: string, page: number, payload: string): Promise<void> {
        const now = Date.now();
        const query = `
      INSERT INTO cached_books (genre, page, payload, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(genre, page) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at;
    `;
        await this.db.run(query, [genre, page, payload, now]);
    }

    async getCachedBooks(genre: string, page: number): Promise<string | null> {
        const res = await this.db.query(
            `SELECT payload FROM cached_books WHERE genre=? AND page=? LIMIT 1`,
            [genre, page]
        );
        return res.values?.[0]?.payload ?? null;
    }

    async hasAnyCacheForGenre(genre: string): Promise<boolean> {
        const res = await this.db.query(
            `SELECT COUNT(1) as c FROM cached_books WHERE genre=?`,
            [genre]
        );
        const c = res.values?.[0]?.c ?? 0;
        return Number(c) > 0;
    }
}