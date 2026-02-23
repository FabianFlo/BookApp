import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from 'src/app/core/services/api.service';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-book-detail',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './book-detail.page.html',
  styleUrls: ['./book-detail.page.scss'],
})
export class BookDetailPage implements OnInit {

  book: any = null;

  authorNames: string[] = [];
  subjects: string[] = [];

  loading = true;
  error = false;

  imageLoaded = false;

  constructor(
    private route: ActivatedRoute,
    private apiService: ApiService
  ) {}

  ngOnInit() {
    const workKey = this.route.snapshot.paramMap.get('key');
    if (workKey) this.loadBook(workKey);
  }

  loadBook(workKey: string) {
    this.loading = true;
    this.error = false;
    this.imageLoaded = false;

    this.apiService.getBookDetail(workKey).pipe(
      switchMap((work: any) => {
        this.book = work;

        // Subjects relevantes (máximo 8 para UI)
        this.subjects = Array.isArray(work?.subjects)
          ? work.subjects.slice(0, 8)
          : [];

        // Autores -> resolver nombres
        const authorKeys: string[] = (work?.authors || [])
          .map((a: any) => a?.author?.key)
          .filter(Boolean);

        if (authorKeys.length === 0) {
          this.authorNames = [];
          return of(work);
        }

        return forkJoin(
          authorKeys.map((k) =>
            this.apiService.getAuthorDetail(k).pipe(
              map((a: any) => a?.name || 'Autor desconocido'),
              catchError(() => of('Autor desconocido'))
            )
          )
        ).pipe(
          map((names: string[]) => {
            this.authorNames = names;
            return work;
          })
        );
      }),
      catchError(() => {
        this.error = true;
        this.loading = false;
        return of(null);
      })
    ).subscribe({
      next: () => {
        this.loading = false;
      }
    });
  }

  onImageLoad() {
    this.imageLoaded = true;
  }

  get description(): string {
    if (!this.book?.description) return 'Sin descripción disponible.';
    return typeof this.book.description === 'string'
      ? this.book.description
      : (this.book.description?.value || 'Sin descripción disponible.');
  }

  // OpenLibrary: covers = [id, id...]
  get coverUrl(): string | null {
    if (!this.book?.covers?.length) return null;
    return `https://covers.openlibrary.org/b/id/${this.book.covers[0]}-L.jpg`;
  }

  // Año/publicación: a veces viene "first_publish_date" como string (ej: "1900")
  get publishInfo(): string {
    const fp = this.book?.first_publish_date;
    if (!fp) return 'No disponible';
    return String(fp);
  }
}