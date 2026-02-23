import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class ApiService {

    private BASE_URL = 'https://openlibrary.org';

    constructor(private http: HttpClient) { }

    getBooksByGenre(subject: string, limit: number = 20, offset: number = 0): Observable<any> {
        return this.http.get<any>(
            `${this.BASE_URL}/subjects/${subject}.json?limit=${limit}&offset=${offset}`
        );
    }

    getBookDetail(workKey: string) {
        return this.http.get(`${this.BASE_URL}${workKey}.json`);
    }

    getAuthorDetail(authorKey: string) {
        return this.http.get(`${this.BASE_URL}${authorKey}.json`);
    }

    searchBooks(query: string, page: number = 1) {
        return this.http.get<any>(
            `${this.BASE_URL}/search.json?q=${query}&page=${page}`
        );
    }
}