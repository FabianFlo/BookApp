import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from 'src/app/core/services/api.service';
import { forkJoin, of, from } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { DatabaseService } from 'src/app/core/services/database.service';

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
    private apiService: ApiService,
    private db: DatabaseService
  ) {}

  ngOnInit() {
    const workKey = this.route.snapshot.paramMap.get('key');
    if (workKey) this.loadBook(workKey);
  }

  private hasConnection(): boolean {
    return navigator.onLine;
  }

  loadBook(workKey: string) {

    this.loading = true;
    this.error = false;
    this.imageLoaded = false;

    // Si no hay conexión → intentar cache primero
    if (!this.hasConnection()) {
      this.loadFromCache(workKey);
      return;
    }

    this.apiService.getBookDetail(workKey).pipe(

      switchMap((work: any) => {

        this.book = work;

        this.subjects = Array.isArray(work?.subjects)
          ? work.subjects.slice(0, 8)
          : [];

        const authorKeys: string[] = (work?.authors || [])
          .map((a: any) => a?.author?.key)
          .filter(Boolean);

        if (authorKeys.length === 0) {
          return of({ work, authorNames: [] });
        }

        return forkJoin(
          authorKeys.map((k) =>
            this.apiService.getAuthorDetail(k).pipe(
              map((a: any) => a?.name || 'Autor desconocido'),
              catchError(() => of('Autor desconocido'))
            )
          )
        ).pipe(
          map((names: string[]) => ({
            work,
            authorNames: names
          }))
        );
      }),

      switchMap(async ({ work, authorNames }) => {

        this.authorNames = authorNames;

        await this.db.upsertCachedBookDetail(
          workKey,
          JSON.stringify({
            work,
            authorNames,
            subjects: this.subjects
          })
        );

        return true;
      }),

      catchError(() => {
        return from(this.loadFromCache(workKey));
      })

    ).subscribe({
      next: () => this.loading = false
    });
  }

  private async loadFromCache(workKey: string) {
    const cached = await this.db.getCachedBookDetail(workKey);

    if (cached) {
      const parsed = JSON.parse(cached);
      this.book = parsed.work;
      this.authorNames = parsed.authorNames || [];
      this.subjects = parsed.subjects || [];
    } else {
      this.error = true;
    }

    this.loading = false;
  }

  onImageLoad() {
    this.imageLoaded = true;
  }

  onImageError() {
    // evita error de imagen en consola
    this.imageLoaded = false;
  }

  get description(): string {
    if (!this.book?.description) return 'Sin descripción disponible.';
    return typeof this.book.description === 'string'
      ? this.book.description
      : (this.book.description?.value || 'Sin descripción disponible.');
  }

  get coverUrl(): string | null {
    if (!this.book?.covers?.length) return null;
    if (!navigator.onLine) return null; // evita request si offline
    return `https://covers.openlibrary.org/b/id/${this.book.covers[0]}-L.jpg`;
  }

  get publishInfo(): string {
    const fp = this.book?.first_publish_date;
    return fp ? String(fp) : 'No disponible';
  }
}