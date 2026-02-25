import { Component, OnInit } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from 'src/app/core/services/api.service';
import { forkJoin, of, from } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { DatabaseService } from 'src/app/core/services/database.service';
import { CoverService } from 'src/app/core/services/cover.service';

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
  coverUrl: string | null = null;

  // ── Listas ──────────────────────────────────────────────
  showListModal = false;
  userLists: { id: number; name: string; created_at: number }[] = [];
  /** map listId → true si el libro ya está en esa lista */
  bookInLists: Record<number, boolean> = {};

  private currentWorkKey = '';

  constructor(
    private route: ActivatedRoute,
    private apiService: ApiService,
    private db: DatabaseService,
    private coverService: CoverService,
    private toast: ToastController
  ) {}

  ngOnInit() {
    const workKey = this.route.snapshot.paramMap.get('key');
    if (workKey) {
      this.currentWorkKey = workKey;
      this.loadBook(workKey);
    }
  }

  private hasConnection(): boolean {
    return navigator.onLine;
  }

  loadBook(workKey: string) {
    this.loading = true;
    this.error = false;
    this.imageLoaded = false;
    this.coverUrl = null;

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
          map((names: string[]) => ({ work, authorNames: names }))
        );
      }),

      switchMap(async ({ work, authorNames }) => {
        this.authorNames = authorNames;

        await this.db.upsertCachedBookDetail(
          workKey,
          JSON.stringify({ work, authorNames, subjects: this.subjects })
        );

        return true;
      }),

      catchError(() => from(this.loadFromCache(workKey)))

    ).subscribe({
      next: async () => {
        await this.hydrateCover();
        this.loading = false;
      }
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

    await this.hydrateCover();
    this.loading = false;
  }

  private async hydrateCover() {
    const coverId = this.book?.covers?.[0] ?? null;
    this.coverUrl = await this.coverService.getCoverUrl(coverId);
  }

  // ── Listas ──────────────────────────────────────────────

  async openAddToListModal() {
    this.userLists = await this.db.getLists();

    // Verificar en qué listas ya está el libro
    this.bookInLists = {};
    for (const list of this.userLists) {
      this.bookInLists[list.id] = await this.db.isBookInList(list.id, this.currentWorkKey);
    }

    this.showListModal = true;
  }

  async addToList(listId: number) {
    if (!this.book) return;

    // Si ya está marcado localmente, no intentar insertar
    if (this.bookInLists[listId]) {
      await this.showToast('El libro ya está en esta lista', 'warning');
      return;
    }

    const result = await this.db.addBookToList(listId, {
      work_key: this.currentWorkKey,
      title: this.book.title,
      author: this.authorNames[0] ?? undefined,
      cover_id: this.book?.covers?.[0] ?? undefined,
      first_publish_year: this.book?.first_publish_date
        ? Number(String(this.book.first_publish_date).slice(0, 4))
        : undefined,
    });

    if (result === 'added') {
      // Actualizar estado local inmediatamente
      this.bookInLists = { ...this.bookInLists, [listId]: true };
      await this.showToast('Libro agregado a la lista', 'success');
    } else {
      this.bookInLists = { ...this.bookInLists, [listId]: true };
      await this.showToast('El libro ya está en esta lista', 'warning');
    }
  }

  private async showToast(message: string, color: string) {
    const t = await this.toast.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }

  onImageLoad() { this.imageLoaded = true; }
  onImageError() { this.imageLoaded = false; }

  get description(): string {
    if (!this.book?.description) return 'Sin descripción disponible.';
    return typeof this.book.description === 'string'
      ? this.book.description
      : (this.book.description?.value || 'Sin descripción disponible.');
  }

  get publishInfo(): string {
    const fp = this.book?.first_publish_date;
    return fp ? String(fp) : 'No disponible';
  }
}