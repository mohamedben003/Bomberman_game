import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { ChatComponent } from '../../components/chat/chat.component';
import { ConnectionBannerComponent } from '../../components/connection-banner/connection-banner.component';
import { CountdownComponent } from '../../components/countdown/countdown.component';
import { PlayerListComponent } from '../../components/player-list/player-list.component';
import { GameViewService } from '../../core/game-view.service';
import { RoomStore } from '../../core/room-store';
import { SessionService } from '../../core/session.service';

/**
 * Waiting room: room id, player counter, the two server timers and chat.
 *
 * The socket is opened here (once) and stays open while the page navigates to
 * the game, so no first snapshot is lost when MATCH_START arrives.
 */
@Component({
  selector: 'app-waiting-page',
  imports: [
    ChatComponent,
    ConnectionBannerComponent,
    CountdownComponent,
    PlayerListComponent,
  ],
  templateUrl: './waiting.page.html',
  styleUrl: './waiting.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaitingPage implements OnInit, OnDestroy {
  private readonly sessions = inject(SessionService);
  private readonly rooms = inject(RoomStore);
  private readonly view = inject(GameViewService);
  private readonly router = inject(Router);

  protected readonly room = this.rooms.room;
  protected readonly chat = this.rooms.chat;
  protected readonly status = this.rooms.status;
  protected readonly closeReason = this.rooms.closeReason;
  protected readonly error = this.rooms.lastError;
  protected readonly count = this.rooms.count;
  protected readonly maxPlayers = this.rooms.maxPlayers;
  protected readonly meId = this.rooms.meId;
  protected readonly roomId = computed(() => this.rooms.room()?.roomId ?? '');
  protected readonly copied = signal(false);
  protected readonly disconnected = computed(
    () => this.status() === 'closed' || this.status() === 'error',
  );

  private roomCleared = false;
  private navigatingToGame = false;

  constructor() {
    // MATCH_START can arrive while this page is open: the socket service already
    // forwarded it to GameViewService, so nothing is lost when the game page loads.
    effect(() => {
      if (this.view.match() && !this.navigatingToGame) {
        this.navigatingToGame = true;
        void this.router.navigate(['/game']).then(
          (success) => { if (!success) this.navigatingToGame = false; },
          () => { this.navigatingToGame = false; },
        );
      }
    });

    // Fatal JOIN errors (NICKNAME_TAKEN, INVALID_SESSION) return to the nickname
    // page with a readable message (Phase 0 definition of done).
    effect(() => {
      const failure = this.rooms.lastError();
      if (!failure?.fatal || this.roomCleared) {
        return;
      }
      this.cleanupRoom();
      void this.router.navigate(['/nickname'], { queryParams: { reason: failure.message } });
    });
  }

  ngOnInit(): void {
    const sessionId = this.sessions.sessionId();
    if (sessionId) {
      this.rooms.join(sessionId);
    }
  }

  ngOnDestroy(): void {
    const destination = this.router.getCurrentNavigation()?.finalUrl?.toString();
    if (!(this.navigatingToGame && destination === '/game')) {
      this.cleanupRoom();
    }
  }

  protected copyRoomId(): void {
    const roomId = this.roomId();
    if (!roomId || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(roomId).then(
      () => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 1500);
      },
      () => this.copied.set(false),
    );
  }

  protected sendChat(text: string): void {
    this.rooms.sendChat(text);
  }

  /** Retries JOIN after a non-fatal error such as ROOM_FULL. */
  protected retry(): void {
    const sessionId = this.sessions.sessionId();
    if (!sessionId) {
      this.leave();
      return;
    }
    this.rooms.dismissError();
    this.rooms.retryJoin(sessionId);
  }

  protected leave(): void {
    if (this.roomCleared) {
      return;
    }
    this.cleanupRoom();
    void this.router.navigate(['/nickname']);
  }

  private cleanupRoom(): void {
    if (this.roomCleared) {
      return;
    }
    this.roomCleared = true;
    this.rooms.leave();
    this.sessions.clear();
    this.view.reset();
  }
}
