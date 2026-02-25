import { Component, OnInit } from '@angular/core';
import { IonicModule, AlertController, ToastController, ActionSheetController, IonRouterOutlet } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DatabaseService } from 'src/app/core/services/database.service';
import { CoverService } from 'src/app/core/services/cover.service';

const MAX_LISTS = 3;

interface ListWithBooks {
  id: number;
  name: string;
  created_at: number;
  books: any[];
  expanded: boolean;
}

@Component({
  selector: 'app-lists',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './lists.page.html',
  styleUrls: ['./lists.page.scss'],
})
export class ListsPage implements OnInit {

  lists: ListWithBooks[] = [];
  loading = true;
  /** map cover_id → url resuelta (cache o red) */
  coverMap: Record<number, string> = {};

  constructor(
    private db: DatabaseService,
    private alert: AlertController,
    private toast: ToastController,
    private actionSheet: ActionSheetController,
    private coverService: CoverService,
    private router: Router
  ) {}

  openDetail(book: any) {
    if (!book?.work_key) return;
    this.router.navigate(['/book', book.work_key]);
  }

  ngOnInit() {
    this.loadLists();
  }

  /** Se ejecuta CADA VEZ que el tab/page se muestra, no solo la primera vez */
  ionViewWillEnter() {
    this.loadLists();
  }

  /** Recarga listas + libros de cada una */
  async loadLists() {
    this.loading = true;
    const raw = await this.db.getLists();

    this.lists = await Promise.all(
      raw.map(async (l) => ({
        ...l,
        books: await this.db.getBooksInList(l.id),
        expanded: false,
      }))
    );

    await this.hydrateCovers();

    this.loading = false;
  }

  private async hydrateCovers() {
    const allBooks: any[] = ([] as any[]).concat(...this.lists.map((l: ListWithBooks) => l.books));
    const tasks = allBooks
      .filter((b: any) => b.cover_id)
      .map(async (b: any) => {
        const url = await this.coverService.getCoverUrl(b.cover_id);
        if (url) this.coverMap[b.cover_id] = url;
      });
    await Promise.all(tasks);
  }

  // ── CREAR LISTA ──────────────────────────────────────────

  async createList() {
    if (this.lists.length >= MAX_LISTS) {
      await this.showToast(`Máximo ${MAX_LISTS} listas permitidas`, 'warning');
      return;
    }

    const alert = await this.alert.create({
      header: 'Nueva lista',
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Nombre de la lista',
          attributes: { maxlength: 40 },
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Crear',
          handler: async (data) => {
            const name = (data.name || '').trim();
            if (!this.isValidName(name)) return false; // mantiene el alert abierto
            await this.db.createList(name);
            await this.loadLists();
            await this.showToast('Lista creada', 'success');
            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  // ── OPCIONES DE LISTA (editar / eliminar) ────────────────

  async openListOptions(list: ListWithBooks) {
    const sheet = await this.actionSheet.create({
      header: list.name,
      buttons: [
        {
          text: 'Renombrar',
          icon: 'pencil-outline',
          handler: () => this.renameList(list),
        },
        {
          text: 'Eliminar lista',
          icon: 'trash-outline',
          role: 'destructive',
          handler: () => this.confirmDeleteList(list),
        },
        { text: 'Cancelar', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async renameList(list: ListWithBooks) {
    const alert = await this.alert.create({
      header: 'Renombrar lista',
      inputs: [
        {
          name: 'name',
          type: 'text',
          value: list.name,
          attributes: { maxlength: 40 },
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: async (data) => {
            const name = (data.name || '').trim();
            if (!this.isValidName(name)) return false;
            await this.db.renameList(list.id, name);
            await this.loadLists();
            await this.showToast('Lista renombrada', 'success');
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmDeleteList(list: ListWithBooks) {
    const alert = await this.alert.create({
      header: 'Eliminar lista',
      message: `¿Eliminar "${list.name}"? Se eliminarán todos sus libros.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            await this.db.deleteList(list.id);
            await this.loadLists();
            await this.showToast('Lista eliminada', 'danger');
          },
        },
      ],
    });
    await alert.present();
  }

  // ── ELIMINAR LIBRO DE LISTA ──────────────────────────────

  async confirmRemoveBook(list: ListWithBooks, book: any) {
    const alert = await this.alert.create({
      header: 'Quitar libro',
      message: `¿Quitar "${book.title}" de la lista?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Quitar',
          role: 'destructive',
          handler: async () => {
            await this.db.removeBookFromList(list.id, book.work_key);
            list.books = await this.db.getBooksInList(list.id);
            await this.showToast('Libro eliminado de la lista', 'medium');
          },
        },
      ],
    });
    await alert.present();
  }

  // ── TOGGLE EXPAND ────────────────────────────────────────

  toggleExpand(list: ListWithBooks) {
    list.expanded = !list.expanded;
  }

  // ── PORTADA ──────────────────────────────────────────────

  getCoverUrl(coverId: number | null | undefined): Promise<string | null> {
    return this.coverService.getCoverUrl(coverId ?? null);
  }

  // ── HELPERS ──────────────────────────────────────────────

  private isValidName(name: string): boolean {
    if (!name || name.length < 1) {
      this.showToast('El nombre no puede estar vacío', 'warning');
      return false;
    }
    if (name.length > 40) {
      this.showToast('El nombre es demasiado largo (máx. 40 caracteres)', 'warning');
      return false;
    }
    return true;
  }

  private async showToast(message: string, color: string) {
    const t = await this.toast.create({ message, duration: 2000, color, position: 'bottom' });
    await t.present();
  }

  get canCreateList(): boolean {
    return this.lists.length < MAX_LISTS;
  }
}