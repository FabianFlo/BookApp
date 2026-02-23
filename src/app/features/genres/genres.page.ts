import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ApiService } from 'src/app/core/services/api.service';
import { DatabaseService } from 'src/app/core/services/database.service';
import { Book } from 'src/app/core/models/book.model';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-genres',
  standalone: true,
  imports: [IonicModule, CommonModule, RouterModule],
  templateUrl: './genres.page.html',
  styleUrls: ['./genres.page.scss'],
})
export class GenresPage implements OnInit {
  selectedGenre: string | null = null;
  books: Book[] = [];
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
    private db: DatabaseService
  ) {}

  async ngOnInit() {
    await this.db.init();
    this.isOffline = !navigator.onLine;
    window.addEventListener('online',  () => { this.isOffline = false; });
    window.addEventListener('offline', () => { this.isOffline = true; });
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

    if (navigator.onLine) {
      const offset = (this.currentPage - 1) * this.limit;
      this.apiService.getBooksByGenre(this.selectedGenre, this.limit, offset).subscribe({
        next: async (response: any) => {
          const works = response.works || [];
          this.books = works;
          this.noResults = works.length === 0;
          const total = response.work_count || 200;
          this.totalPages = Math.ceil(total / this.limit);
          this.loading = false;
          // Guardar en SQLite
          await this.db.upsertCachedBooks(
            this.selectedGenre!,
            this.currentPage,
            JSON.stringify({ works, work_count: total })
          );
        },
        error: async () => {
          await this.loadFromCache();
        }
      });
    } else {
      this.loadFromCache();
    }
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
    this.loading = false;
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
}