import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';

import { parseServerMessage, type ClientMessage, type ServerMessage } from './models/ws-messages';
import { DemoService } from './demo.service';

/** Connection lifecycle of the one socket a tab is allowed to own. */
export type SocketStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

/**
 * Owns the single WebSocket of the tab (PROTOCOL.md §1.2).
 *
 * - one connection for the whole session, reused by the waiting and game pages;
 * - `JOIN` is the first frame sent after `open`;
 * - no auto-reconnect: a closed socket stays closed (PROTOCOL.md §7).
 *
 * Every connection gets a generation number. Callbacks from an older socket are
 * ignored, so a late `onclose` can never clear or overwrite a newer connection.
 */
@Injectable({ providedIn: 'root' })
export class GameSocketService {
  private readonly demo = inject(DemoService);
  private socket: WebSocket | null = null;
  private generation = 0;
  /** Session bound to the current socket, so a new session cannot reuse it. */
  private connectedSessionId: string | null = null;

  private readonly incoming = new Subject<ServerMessage>();
  private readonly statusState = signal<SocketStatus>('idle');
  private readonly closeReasonState = signal<string | null>(null);

  /** Typed server messages; RoomStore and GameViewService both read from it. */
  readonly messages$ = this.incoming.asObservable();
  readonly status = this.statusState.asReadonly();
  /** Reason of the last close, shown by the connection banner. */
  readonly closeReason = this.closeReasonState.asReadonly();

  constructor() {
    this.demo.messages$.subscribe((message) => this.incoming.next(message));
  }

  /** Opens the tab's only socket and sends `JOIN` as soon as it is open. */
  connect(sessionId: string): void {
    if (this.demo.enabled()) {
      if (this.connectedSessionId === sessionId && this.statusState() === 'open') return;
      this.close('new demo session');
      this.connectedSessionId = sessionId;
      this.statusState.set('open');
      this.closeReasonState.set(null);
      this.demo.join();
      return;
    }
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
      if (this.connectedSessionId === sessionId) {
        return; // one socket per tab, even if a page asks twice
      }
      // A new session must not reuse the old JOIN: close it before connecting.
      this.close('new session');
    }

    // A socket that is already closing/closed cannot be reused; drop its handlers
    // so its late callbacks do not touch the connection created below.
    this.detach(this.socket);
    this.socket = null;

    const generation = ++this.generation;
    this.connectedSessionId = sessionId;
    this.statusState.set('connecting');
    this.closeReasonState.set(null);

    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(scheme + '://' + location.host + '/ws');
    this.socket = socket;

    socket.onopen = () => {
      if (generation !== this.generation) {
        return;
      }
      this.statusState.set('open');
      this.send({ type: 'JOIN', data: { sessionId } });
    };

    socket.onmessage = (event: MessageEvent<unknown>) => {
      if (generation !== this.generation) {
        return;
      }
      if (typeof event.data !== 'string') {
        return; // the server only sends text frames
      }
      const message = parseServerMessage(event.data);
      if (message) {
        this.incoming.next(message);
      }
    };

    socket.onerror = () => {
      if (generation !== this.generation) {
        return;
      }
      this.statusState.set('error');
    };

    socket.onclose = (event: CloseEvent) => {
      if (generation !== this.generation) {
        return;
      }
      this.socket = null;
      this.connectedSessionId = null;
      this.statusState.set('closed');
      this.closeReasonState.set(event.reason || 'connection closed (' + event.code + ')');
    };
  }

  /** Sends one typed frame; ignored while the socket is not open. */
  send(message: ClientMessage): void {
    if (this.demo.enabled()) {
      if (this.statusState() === 'open') this.demo.receive(message);
      return;
    }
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(message));
  }

  /** Re-sends `JOIN` on the current socket (used to retry a non-fatal room error). */
  join(sessionId: string): void {
    if (this.demo.enabled()) {
      this.demo.join();
      return;
    }
    this.send({ type: 'JOIN', data: { sessionId } });
  }

  /** Closes the socket on purpose (leaving the room / match finished). */
  close(reason = 'left the room'): void {
    this.demo.close();
    const socket = this.socket;
    this.socket = null;
    this.connectedSessionId = null;
    this.generation++; // invalidate every callback of the old socket
    this.detach(socket);
    if (socket && socket.readyState <= WebSocket.OPEN) {
      socket.close(1000, reason.slice(0, 60));
    }
    this.statusState.set('closed');
    this.closeReasonState.set(reason);
  }

  private detach(socket: WebSocket | null): void {
    if (!socket) {
      return;
    }
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
  }
}
