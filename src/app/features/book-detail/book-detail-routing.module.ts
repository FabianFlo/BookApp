import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { BookDetailPage } from './book-detail.page';

const routes: Routes = [
  {
    path: '',
    component: BookDetailPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BookDetailPageRoutingModule {}
