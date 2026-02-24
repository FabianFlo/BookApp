import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class ApiService {

    private BASE_URL = 'https://openlibrary.org';

    constructor(private http: HttpClient) { }

    // LIBROS POR GÉNERO (OpenLibrary real)
    getBooksByGenre(
        subject: string,
        limit: number = 5,
        offset: number = 0
    ): Observable<any> {

        return this.http.get<any>(
            `${this.BASE_URL}/subjects/${subject}.json?limit=${limit}&offset=${offset}`
        );
    }

    // Helper Promise (para preload masivo)
    async getBooksByGenreOnce(
        subject: string,
        limit: number = 5,
        offset: number = 0
    ): Promise<any> {
        return await firstValueFrom(
            this.getBooksByGenre(subject, limit, offset)
        );
    }

    // DETALLE DE LIBRO (work)
    // workKey viene como: /works/OLxxxxW
    getBookDetail(workKey: string): Observable<any> {
        return this.http.get<any>(`${this.BASE_URL}${workKey}.json`);
    }

    async getBookDetailOnce(workKey: string): Promise<any> {
        return await firstValueFrom(this.getBookDetail(workKey));
    }

    // DETALLE DE AUTOR
    // authorKey viene como: /authors/OLxxxxA
    getAuthorDetail(authorKey: string): Observable<any> {
        return this.http.get<any>(`${this.BASE_URL}${authorKey}.json`);
    }

    async getAuthorDetailOnce(authorKey: string): Promise<any> {
        return await firstValueFrom(this.getAuthorDetail(authorKey));
    }

    // BÚSQUEDA GENERAL
    searchBooks(query: string, page: number = 1): Observable<any> {
        return this.http.get<any>(
            `${this.BASE_URL}/search.json?q=${encodeURIComponent(query)}&page=${page}`
        );
    }

    async searchBooksOnce(query: string, page: number = 1): Promise<any> {
        return await firstValueFrom(this.searchBooks(query, page));
    }
}