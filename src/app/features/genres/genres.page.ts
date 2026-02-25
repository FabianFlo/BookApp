import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ApiService } from 'src/app/core/services/api.service';
import { DatabaseService } from 'src/app/core/services/database.service';
import { Book } from 'src/app/core/models/book.model';
import { RouterModule } from '@angular/router';
import { from } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CoverService } from 'src/app/core/services/cover.service';

type BookWithCover = Book & {
  _coverUrl?: string;
  _coverLoaded?: boolean;
};

@Component({
  selector: 'app-genres',
  standalone: true,
  imports: [IonicModule, CommonModule, RouterModule],
  templateUrl: './genres.page.html',
  styleUrls: ['./genres.page.scss'],
})
export class GenresPage implements OnInit {

  selectedGenre: string | null = null;
  books: BookWithCover[] = [];

  loading = false;
  error = false;
  noResults = false;
  isOffline = false;
  noCache = false;

  genreLabels: Record<string, string> = {
    fantasy: 'Fantasía',
    science_fiction: 'Sci-fi',
    romance: 'Romance',
    history: 'Historia'
  };

  currentPage = 1;
  limit = 5;
  totalPages = 0;

  constructor(
    private apiService: ApiService,
    private db: DatabaseService,
    private coverService: CoverService
  ) { }

  async ngOnInit() {
    await this.db.init();
    this.updateConnectionStatus();

    window.addEventListener('online', () => this.updateConnectionStatus());
    window.addEventListener('offline', () => this.updateConnectionStatus());
  }

  private updateConnectionStatus() {
    this.isOffline = !navigator.onLine;
  }

  private hasConnection(): boolean {
    return navigator.onLine;
  }

  get currentGenreLabel(): string {
    return this.selectedGenre ? this.genreLabels[this.selectedGenre] : 'Géneros';
  }

  selectGenre(subject: string) {
    this.selectedGenre = subject;
    this.currentPage = 1;
    this.loadBooks();
  }

  resetGenres() {
    this.selectedGenre = null;
    this.books = [];
    this.error = false;
    this.loading = false;
    this.noResults = false;
    this.noCache = false;
    this.currentPage = 1;
  }

  loadBooks() {
    if (!this.selectedGenre) return;

    this.loading = true;
    this.error = false;
    this.noResults = false;
    this.noCache = false;

    if (!this.hasConnection()) {
      this.loadFromCache();
      return;
    }

    const offset = (this.currentPage - 1) * this.limit;

    this.apiService.getBooksByGenre(this.selectedGenre, this.limit, offset)
      .pipe(
        catchError(() => from(this.loadFromCache()))
      )
      .subscribe(async (response: any) => {

        if (!response?.works) {
          this.loading = false;
          return;
        }

        const works: BookWithCover[] = response.works || [];
        this.books = works;

        const total = response.work_count || 200;
        this.totalPages = Math.ceil(total / this.limit);

        await this.db.upsertCachedBooks(
          this.selectedGenre!,
          this.currentPage,
          JSON.stringify({ works, work_count: total })
        );

        await this.hydrateCovers();

        this.noResults = works.length === 0;
        this.loading = false;
      });
  }

  private async loadFromCache() {
    const cached = await this.db.getCachedBooks(this.selectedGenre!, this.currentPage);

    if (cached) {
      const data = JSON.parse(cached);
      this.books = data.works ?? [];
      this.totalPages = Math.ceil((data.work_count ?? 200) / this.limit);
      this.noResults = this.books.length === 0;
    } else {
      this.books = [];
      this.noCache = true;
      this.noResults = true;
    }

    await this.hydrateCovers();
    this.loading = false;
  }


  async hydrateCovers() {
    // Resetear estado antes de cargar
    this.books.forEach(book => {
      book._coverLoaded = false;
      book._coverUrl = undefined;
    });

    const tasks = this.books.map(async (book) => {
      book._coverUrl = await this.coverService.getCoverUrl(book.cover_id ?? null);
    });

    await Promise.all(tasks);
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.loadBooks();
  }

  get visiblePages(): number[] {
    const max = 5;
    const start = Math.max(1, this.currentPage - 2);
    const end = Math.min(this.totalPages, start + max - 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  onImageError(event: any) {
    event.target.src = 'assets/no-cover.png';
  }
}