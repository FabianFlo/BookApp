import { Component, OnInit } from '@angular/core';
import { NetworkService } from './core/services/network.service';
import { DatabaseService } from './core/services/database.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit{
  constructor(
    private networkService: NetworkService,
    private db: DatabaseService
  ) {}

  async ngOnInit() {
    await this.networkService.init();
    await this.db.init();
  }
}
