import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ApiService } from 'src/app/core/services/api.service';
import { Book } from 'src/app/core/models/book.model';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-genres',
  standalone: true,
  imports: [IonicModule, CommonModule, RouterModule ],
  templateUrl: './genres.page.html',
  styleUrls: ['./genres.page.scss'],
})
export class GenresPage {

  selectedGenre: string | null = null;

  books: Book[] = [];

  loading = false;
  error = false;
  noResults = false;

  // Etiquetas para mostrar nombre correcto en el título
  genreLabels: Record<string, string> = {
    fantasy: 'Fantasía',
    science_fiction: 'Sci-fi',
    romance: 'Romance',
    history: 'Historia'
  };

  // PAGINACIÓN
  currentPage = 1;
  limit = 10;
  totalPages = 0;

  constructor(private apiService: ApiService) {}

  // Título dinámico
  get currentGenreLabel(): string {
    return this.selectedGenre
      ? this.genreLabels[this.selectedGenre]
      : 'Géneros';
  }

  // Seleccionar género
  selectGenre(subject: string) {
    this.selectedGenre = subject;
    this.currentPage = 1;
    this.loadBooks();
  }

  // Volver atrás
  resetGenres() {
    this.selectedGenre = null;
    this.books = [];
    this.error = false;
    this.loading = false;
    this.noResults = false;
    this.currentPage = 1;
  }

  // Cargar libros según página actual
  loadBooks() {
    if (!this.selectedGenre) return;

    this.loading = true;
    this.error = false;
    this.noResults = false;

    const offset = (this.currentPage - 1) * this.limit;

    this.apiService
      .getBooksByGenre(this.selectedGenre, this.limit, offset)
      .subscribe({
        next: (response: any) => {

          const works = response.works || response;

          if (!works || works.length === 0) {
            this.noResults = true;
          }

          this.books = works;

          const total = response.work_count || 200; // fallback si no viene
          this.totalPages = Math.ceil(total / this.limit);

          this.loading = false;
        },
        error: () => {
          this.error = true;
          this.loading = false;
        }
      });
  }

  // Cambiar página
  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.loadBooks();
  }

  // Mostrar máximo 5 páginas visibles
  get visiblePages(): number[] {
    const max = 5;
    const start = Math.max(1, this.currentPage - 2);
    const end = Math.min(this.totalPages, start + max - 1);

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
}