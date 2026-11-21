import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { BoardComponent } from '../../components/board/board.component';
import { ChatComponent } from '../../components/chat/chat.component';
import { ConnectionBannerComponent } from '../../components/connection-banner/connection-banner.component';
import { HudComponent } from '../../components/hud/hud.component';
import { PerfOverlayComponent } from '../../components/perf-overlay/perf-overlay.component';
import { PlayerListComponent } from '../../components/player-list/player-list.component';
import { FpsMeterService } from '../../core/fps-meter.service';
import { DemoService } from '../../core/demo.service';
import { GameViewService, type RenderPlayer } from '../../core/game-view.service';
import type { Direction, RoomPlayer } from '../../core/models/room.models';
import { RoomStore } from '../../core/room-store';
import { SessionService } from '../../core/session.service';

/** Physical key codes; `event.code` also gives ZQSD on AZERTY (ARCHITECTURE.md §7.5). */
const DIRECTION_BY_CODE: Readonly<Record<string, Direction>> = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  KeyW: 'UP',
  KeyS: 'DOWN',
  KeyA: 'LEFT',
  KeyD: 'RIGHT',
};

/**
 * The match page: owns the single requestAnimationFrame loop and all gameplay input.
 *
 * Each frame reads GameViewService (which interpolates 66 ms in the past) and
 * writes one signal consumed only by the players layer. Nothing per frame goes
 * into RoomStore, and nothing here reads layout (TASKS pitfalls).
 *
 * Input follows ARCHITECTURE.md §7.5: held-direction stack by `event.code`,
 * `MOVE` only on an effective change, `STOP` on release/blur/hide/chat/death,
 * one `PLACE_BOMB` per key press, and no gameplay keys while the chat input has
 * focus.
 */
@Component({
  selector: 'app-game-page',
  imports: [
    BoardComponent,
    HudComponent,
    PlayerListComponent,
    ChatComponent,
    ConnectionBannerComponent,
    PerfOverlayComponent,
    RouterLink,
  ],
  templateUrl: './game.page.html',
  styleUrl: './game.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamePage implements OnInit, OnDestroy {
  private readonly view = inject(GameViewService);
  private readonly rooms = inject(RoomStore);
  private readonly sessions = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly demo = inject(DemoService);

  protected readonly fps = inject(FpsMeterService);
  private readonly chat = viewChild<ChatComponent>('chat');

  protected readonly tiles = this.view.tiles;
  protected readonly stats = this.view.stats;
  protected readonly players = signal<readonly RenderPlayer[]>([]);
  protected readonly chatMessages = this.rooms.chat;
  protected readonly roomPlayers = this.rooms.players;
  protected readonly status = this.rooms.status;
  protected readonly closeReason = this.rooms.closeReason;
  protected readonly ended = this.rooms.matchEnd;
  protected readonly debug = signal(new URLSearchParams(location.search).has('debug'));
  protected readonly roomId = computed(() => this.rooms.room()?.roomId ?? '');
  protected readonly meId = computed(() => this.view.you()?.playerId ?? this.rooms.meId() ?? null);

  protected readonly disconnected = computed(
    () =>
      !this.ended() &&
      (this.status() === 'closed' || this.status() === 'error'),
  );

  /** The HUD/board state exists only once MATCH_START arrived. */
  protected readonly matchReady = computed(() => this.view.match() !== null);

  protected readonly spectating = computed(() => {
    const me = this.stats().find((player) => player.playerId === this.meId());
    return this.matchReady() && !!me && !me.alive;
  });

  /** The player list during a match, with the slots assigned at MATCH_START. */
  protected readonly matchPlayers = computed<readonly RoomPlayer[]>(() =>
    this.stats().map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      slot: player.slot,
      connected: true,
    })),
  );

  /**
   * Server-confirmed state that allows gameplay actions.
   *
   * The authoritative `MATCH_START` plus a live snapshot is enough: PROTOCOL.md
   * §3 shows `COUNTDOWN` `ROOM_STATE` → `MATCH_START` → `SNAPSHOT` without a
   * guaranteed `PLAYING` `ROOM_STATE`, so a stale lobby phase must not disable
   * controls after the match has started. The server still enforces every rule.
   */
  protected readonly canPlay = computed(() => {
    const me = this.stats().find((player) => player.playerId === this.meId());
    return (
      this.matchReady() &&
      !this.ended() &&
      this.status() === 'open' &&
      !!me?.alive
    );
  });

  private frameId = 0;
  /** Physical `event.code`s currently held, in press order (ARCHITECTURE.md §7.5). */
  private heldCodes: string[] = [];
  private bombHeld = false;
  private sentDirection: Direction | null = null;
  private destroyed = false;
  private roomCleared = false;
  private navigating = false;

  private readonly onKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event);
  private readonly onKeyUp = (event: KeyboardEvent): void => this.handleKeyUp(event);
  private readonly onBlur = (): void => this.clearHeld(true);
  private readonly onVisibility = (): void => {
    if (document.hidden) {
      this.clearHeld(true);
      this.stopLoop();
    } else {
      // Coming back from a hidden tab: jump to the newest snapshot instead of sliding.
      this.view.snap();
      this.startLoop(); // gated again: a lost socket or a finished match must not resume
    }
  };

  constructor() {
    // MATCH_END: stop everything, park the socket and show persisted results.
    effect(() => {
      const end = this.rooms.matchEnd();
      if (!end || this.navigating) {
        return;
      }
      this.navigating = true;
      this.stopLoop();
      this.clearHeld(true);
      this.rooms.parkSocket();
      void this.router.navigate(['/results', end.matchId]);
    });

    // A disconnect or a death must not leave a held direction on the server.
    effect(() => {
      if (!this.canPlay()) {
        this.clearHeld(true);
      }
    });

    // Run the loop only while the page is alive and the match can actually be drawn.
    effect(() => {
      if (this.loopAllowed()) {
        this.startLoop();
      } else {
        this.stopLoop();
      }
    });
  }

  ngOnInit(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.startLoop(); // no-op when the tab is hidden or the match is not ready yet
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopLoop();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);

    if (this.navigating) {
      // MATCH_END already parked the socket; results only need the match id.
      this.clearHeld(false);
      return;
    }
    // Ordinary navigation away (history, nickname, browser back): release the
    // server-side movement intent while the socket is still valid, then leave.
    this.releaseRoom();
  }

  protected sendChat(text: string): void {
    this.rooms.sendChat(text);
  }

  protected finishDemo(): void {
    this.demo.finish();
  }

  protected onChatFocus(focused: boolean): void {
    if (focused) {
      // Chat focus is input focus: release every held direction immediately.
      this.clearHeld(true);
    }
  }

  /** Leaves the match after a connection loss; no reconnect is attempted. */
  protected backToNickname(): void {
    this.stopLoop();
    this.releaseRoom();
    this.sessions.clear();
    void this.router.navigate(['/nickname'], {
      queryParams: { reason: 'The connection to the game server was lost.' },
    });
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.isEditable(event.target)) {
      // Escape still leaves the chat field.
      if (event.key === 'Escape') {
        (event.target as HTMLElement).blur();
        this.clearHeld(true);
        event.preventDefault();
      }
      return;
    }

    if (event.key === 'Enter') {
      // Enter focuses chat from anywhere on the game page.
      this.chat()?.focusInput();
      event.preventDefault();
      return;
    }

    if (event.key === 'Escape') {
      (document.activeElement as HTMLElement | null)?.blur();
      this.clearHeld(true);
      event.preventDefault();
      return;
    }

    const direction = DIRECTION_BY_CODE[event.code];
    if (direction) {
      event.preventDefault();
      if (!this.canPlay()) {
        return;
      }
      this.pressDirection(event.code, event.repeat);
      return;
    }

    if (event.code === 'Space' || event.key === ' ') {
      event.preventDefault(); // never scroll the page
      if (event.repeat || this.bombHeld || !this.canPlay()) {
        return;
      }
      this.bombHeld = true;
      this.rooms.placeBomb();
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.bombHeld = false;
      return;
    }
    const direction = DIRECTION_BY_CODE[event.code];
    if (!direction) {
      return;
    }
    if (!this.isEditable(event.target)) {
      event.preventDefault();
    }
    this.releaseDirection(event.code);
  }

  /** Push the newest direction; only an effective change is sent. */
  private pressDirection(code: string, repeat: boolean): void {
    if (repeat || this.heldCodes.includes(code)) {
      return;
    }
    this.heldCodes.push(code);
    this.sendEffectiveDirection();
  }

  /** Remove a released direction; fall back to the previous held one. */
  private releaseDirection(code: string): void {
    const index = this.heldCodes.indexOf(code);
    if (index === -1) {
      return; // a key released after blur/chat focus was already cleared
    }
    this.heldCodes.splice(index, 1);
    this.sendEffectiveDirection();
  }

  private sendEffectiveDirection(): void {
    const effective = DIRECTION_BY_CODE[this.heldCodes[this.heldCodes.length - 1]] ?? null;
    if (effective === this.sentDirection) {
      return;
    }
    if (effective === null) {
      if (this.sentDirection !== null) {
        this.rooms.sendStop();
      }
    } else {
      this.rooms.sendMove(effective);
    }
    this.sentDirection = effective;
  }

  private clearHeld(sendStop: boolean): void {
    const wasActive = this.sentDirection !== null;
    this.heldCodes = [];
    this.bombHeld = false;
    this.sentDirection = null;
    if (sendStop && wasActive && this.status() === 'open' && !this.ended()) {
      this.rooms.sendStop();
    }
  }

  private releaseRoom(): void {
    if (this.roomCleared) {
      return;
    }
    this.roomCleared = true;
    this.clearHeld(true);
    this.rooms.leave();
    this.view.reset();
  }

  private loopAllowed(): boolean {
    return !this.destroyed && !document.hidden && this.status() === 'open' &&
      this.matchReady() && !this.ended();
  }

  private isEditable(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  private startLoop(): void {
    if (this.frameId !== 0 || !this.loopAllowed()) {
      return;
    }
    const step = (now: number): void => {
      this.frameId = 0;
      if (!this.loopAllowed()) {
        return;
      }
      this.fps.tick(now);
      this.players.set(this.view.sample(now).players);
      if (this.loopAllowed()) {
        this.frameId = requestAnimationFrame(step);
      }
    };
    this.frameId = requestAnimationFrame(step);
  }

  private stopLoop(): void {
    if (this.frameId !== 0) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }
  }
}
