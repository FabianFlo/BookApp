import { Component, OnInit } from '@angular/core';
import { NetworkService } from './core/services/network.service';
import { DatabaseService } from './core/services/database.service';
import { PreloadService } from './core/services/preload.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {

  constructor(
    private networkService: NetworkService,
    private db: DatabaseService,
    private preload: PreloadService
  ) {}

  async ngOnInit() {

    await this.networkService.init();
    await this.db.init();

    if (navigator.onLine) {
      this.preload.preloadInitialData().catch(err => {
        console.warn('Preload falló pero la app sigue funcionando', err);
      });
    }
  }
}