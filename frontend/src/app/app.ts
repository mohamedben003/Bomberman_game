import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import { DemoService } from './core/demo.service';
import { GameViewService } from './core/game-view.service';
import { RoomStore } from './core/room-store';
import { SessionService } from './core/session.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly demo = inject(DemoService);
  private readonly rooms = inject(RoomStore);
  private readonly sessions = inject(SessionService);
  private readonly view = inject(GameViewService);
  private readonly router = inject(Router);

  protected exitDemo(): void {
    this.rooms.leave();
    this.sessions.clear();
    this.view.reset();
    this.demo.disable();
    void this.router.navigate(['/nickname']);
  }
}
