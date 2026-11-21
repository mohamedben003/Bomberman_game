import { Injectable, computed, inject, signal } from '@angular/core';

import { CHAT_MAX_LEN, MAX_PLAYERS } from './models/game.constants';
import type { MatchEndPayload } from './models/match.models';
import type { ChatMessage, Direction, RoomPhase, RoomPlayer, RoomState } from './models/room.models';
import type { ServerMessage, WsError } from './models/ws-messages';
import { GameSocketService } from './game-socket.service';

/** The chat list stays bounded; older lines are dropped (Phase 1 deliverable). */
export const CHAT_CAP = 200;

/**
 * Shared room state for the waiting and game pages.
 *
 * Holds ROOM_STATE / CHAT / ERROR / MATCH_END only. Per-frame SNAPSHOT data never
 * enters this store (see GameViewService), so the app does not change-detect at 60 Hz.
 */
@Injectable({ providedIn: 'root' })
export class RoomStore {
  private readonly socket = inject(GameSocketService);

  private readonly roomState = signal<RoomState | null>(null);
  private readonly chatState = signal<readonly ChatMessage[]>([]);
  private readonly errorState = signal<WsError | null>(null);
  private readonly matchEndState = signal<MatchEndPayload | null>(null);

  readonly room = this.roomState.asReadonly();
  readonly chat = this.chatState.asReadonly();
  readonly lastError = this.errorState.asReadonly();
  readonly matchEnd = this.matchEndState.asReadonly();

  readonly players = computed<readonly RoomPlayer[]>(() => this.roomState()?.players ?? []);
  readonly count = computed(() => this.roomState()?.count ?? 0);
  readonly maxPlayers = computed(() => this.roomState()?.maxPlayers ?? MAX_PLAYERS);
  readonly phase = computed<RoomPhase | null>(() => this.roomState()?.phase ?? null);
  readonly meId = computed(() => this.roomState()?.you.playerId ?? null);
  readonly joined = computed(() => this.roomState() !== null);

  /** Shared connection status and close reason, for the banner. */
  readonly status = this.socket.status;
  readonly closeReason = this.socket.closeReason;

  constructor() {
    this.socket.messages$.subscribe((message) => this.dispatch(message));
  }

  /** Connects the tab's single socket; `JOIN` is sent by the socket service. */
  join(sessionId: string): void {
    this.socket.connect(sessionId);
  }

  /** Retries `JOIN` after a non-fatal error such as `ROOM_FULL`. */
  retryJoin(sessionId: string): void {
    if (this.socket.status() === 'open') {
      this.socket.join(sessionId);
    } else {
      this.socket.connect(sessionId);
    }
  }

  /** Sends a chat line. Trim here; the server owns the 300 character rule. */
  sendChat(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    this.socket.send({ type: 'CHAT', data: { text: trimmed.slice(0, CHAT_MAX_LEN) } });
  }

  /** Sends the current movement intent; only on an effective direction change. */
  sendMove(direction: Direction): void {
    this.socket.send({ type: 'MOVE', data: { direction } });
  }

  /** Clears the movement intent (key release, blur, hide, chat focus). */
  sendStop(): void {
    this.socket.send({ type: 'STOP', data: {} });
  }

  /** One-shot bomb request; the server decides whether it is legal. */
  placeBomb(): void {
    this.socket.send({ type: 'PLACE_BOMB', data: {} });
  }

  dismissError(): void {
    this.errorState.set(null);
  }

  /** Leaves the room and forgets its state. */
  leave(): void {
    this.socket.close();
    this.reset();
  }

  /** Parks the socket after `MATCH_END` without losing the result signal. */
  parkSocket(reason = 'match finished'): void {
    this.socket.close(reason);
  }

  reset(): void {
    this.roomState.set(null);
    this.chatState.set([]);
    this.errorState.set(null);
    this.matchEndState.set(null);
  }

  private dispatch(message: ServerMessage): void {
    switch (message.type) {
      case 'ROOM_STATE':
        this.roomState.set(message.data);
        break;
      case 'CHAT':
        this.chatState.update((list) => [...list, message.data].slice(-CHAT_CAP));
        break;
      case 'ERROR':
        this.errorState.set(message.data);
        break;
      case 'MATCH_END':
        this.matchEndState.set(message.data);
        break;
      default:
        break; // MATCH_START / TILES / SNAPSHOT belong to GameViewService
    }
  }
}
