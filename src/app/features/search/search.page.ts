import { Component } from '@angular/core';
import { ApiService } from 'src/app/core/services/api.service';
import { DatabaseService } from 'src/app/core/services/database.service';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, from } from 'rxjs';
import { Router } from '@angular/router';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './search.page.html',
  styleUrls: ['./search.page.scss'],
})
export class SearchPage {

  query: string = '';
  results: any[] = [];

  loading = false;
  noResults = false;
  isOffline = false;

  currentPage = 1;
  private searchTimeout: any;

  constructor(
    private api: ApiService,
    private db: DatabaseService,
    private router: Router
  ) { }

  openDetail(book: any) {
    if (!book?.key) return;

    // PASAMOS EL KEY TAL CUAL VIENE: "/works/OL15079937W"
    this.router.navigate(['/book', book.key]);
  }

  // ─────────────────────────────
  // DEBOUNCE
  // ─────────────────────────────
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

  // ─────────────────────────────
  // SEARCH
  // ─────────────────────────────
  async search() {

    const q = this.query.trim();
    if (!q) return;

    this.loading = true;
    this.noResults = false;
    this.isOffline = !navigator.onLine;

    // 🔴 OFFLINE
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

        this.loading = false;
      });
  }

  private async searchOffline() {

    const results = await this.db.searchOfflineSimilar(this.query);

    this.results = results;
    this.noResults = results.length === 0;
    this.loading = false;
  }

  // ─────────────────────────────
  // IMÁGENES
  // ─────────────────────────────
  getCoverUrl(coverId: number | null) {
    if (!coverId || !navigator.onLine) {
      return 'assets/no-cover.png';
    }

    return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
  }

  onImageError(event: any) {
    event.target.src = 'assets/no-cover.png';
  }
}