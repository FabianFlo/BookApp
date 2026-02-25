import { Component } from '@angular/core';
import { ApiService } from 'src/app/core/services/api.service';
import { DatabaseService } from 'src/app/core/services/database.service';
import { CoverService } from 'src/app/core/services/cover.service';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, from } from 'rxjs';
import { Router } from '@angular/router';

type SearchResultWithCover = {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  _coverUrl?: string;
  _coverLoaded?: boolean;
  [key: string]: any;
};

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './search.page.html',
  styleUrls: ['./search.page.scss'],
})
export class SearchPage {

  query: string = '';
  results: SearchResultWithCover[] = [];

  loading = false;
  noResults = false;
  isOffline = false;

  currentPage = 1;
  private searchTimeout: any;

  constructor(
    private api: ApiService,
    private db: DatabaseService,
    private router: Router,
    private coverService: CoverService
  ) { }

  openDetail(book: any) {
    if (!book?.key) return;
    this.router.navigate(['/book', book.key]);
  }

  onSearchChange() {
    clearTimeout(this.searchTimeout);
    const q = this.query.trim();

    if (!q) {
      this.results = [];
      this.noResults = false;
      this.loading = false;
      return;
    }

    if (q.length < 3) return;

    this.searchTimeout = setTimeout(() => {
      this.search();
    }, 500);
  }

  async search() {
    const q = this.query.trim();
    if (!q) return;

    this.loading = true;
    this.noResults = false;
    this.isOffline = !navigator.onLine;

    if (!navigator.onLine) {
      await this.searchOffline();
      return;
    }

    this.api.searchBooks(q, this.currentPage)
      .pipe(
        catchError(() => from(this.searchOffline()))
      )
      .subscribe(async (res: any) => {
        if (!res?.docs) {
          this.loading = false;
          return;
        }

        this.results = res.docs;
        this.noResults = this.results.length === 0;

        await this.db.upsertSearchCache(
          q,
          this.currentPage,
          JSON.stringify(res.docs)
        );

        await this.hydrateCovers();

        this.loading = false;
      });
  }

  private async searchOffline() {
    const results = await this.db.searchOfflineSimilar(this.query);
    this.results = results;
    this.noResults = results.length === 0;

    await this.hydrateCovers();

    this.loading = false;
  }

  async hydrateCovers() {
    this.results.forEach(book => {
      book._coverLoaded = false;
      book._coverUrl = undefined;
    });

    const tasks = this.results.map(async (book) => {
      book._coverUrl = await this.coverService.getCoverUrl(book.cover_i ?? null);
    });

    await Promise.all(tasks);
  }

  getFirstAuthor(book: SearchResultWithCover): string {
    return book.author_name?.[0] ?? 'Autor desconocido';
  }

  onImageError(event: any) {
    event.target.src = 'assets/no-cover.png';
  }
}