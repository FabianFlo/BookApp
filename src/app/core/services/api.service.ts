import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Book } from '../models/book.model';

@Injectable({
    providedIn: 'root'
})
export class ApiService {

    private BASE_URL = 'https://openlibrary.org';

    constructor(private http: HttpClient) { }

    // recibir todos los libros
    getBooksByGenre(subject: string, limit: number = 20, offset: number = 0): Observable<Book[]> {
        return this.http
            .get<any>(`${this.BASE_URL}/subjects/${subject}.json?limit=${limit}&offset=${offset}`)
            .pipe(
                map(response => response.works)
            );
    }

    // detalle de libros
    getBookDetail(workKey: string) {
        return this.http.get(`https://openlibrary.org${workKey}.json`);
    }
    getAuthorDetail(authorKey: string) {
        // authorKey viene tipo: /authors/OL23919A
        return this.http.get(`https://openlibrary.org${authorKey}.json`);
    }

    searchBooks(query: string, page: number = 1): Observable<Book[]> {
        return this.http
            .get<any>(`${this.BASE_URL}/search.json?q=${query}&page=${page}`)
            .pipe(
                map(response => response.docs)
            );
    }
}