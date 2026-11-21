import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';

import { DemoService } from './demo.service';
import type { GuestSession } from './models/session.models';

/**
 * Creates the guest session required by `JOIN` and keeps it in memory.
 *
 * The session is deliberately not persisted: refreshing the browser loses it and the player
 * returns to the nickname page (PROTOCOL.md §2.1, §7). The nickname itself is kept so
 * "play again" can pre-fill it.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly demo = inject(DemoService);
  private readonly state = signal<GuestSession | null>(null);
  private readonly lastNicknameState = signal<string | null>(null);

  readonly session = this.state.asReadonly();
  readonly sessionId = computed(() => this.state()?.sessionId ?? null);
  readonly nickname = computed(() => this.state()?.nickname ?? null);
  readonly active = computed(() => this.state() !== null);
  /** Last nickname used in this tab, kept across `clear()` for the play-again form. */
  readonly lastNickname = this.lastNicknameState.asReadonly();

  create(nickname: string): Observable<GuestSession> {
    const body = { nickname: nickname.trim() };
    const request = this.demo.enabled()
      ? of(this.demo.createSession(body.nickname))
      : this.http.post<GuestSession>('/api/sessions', body);
    return request
      .pipe(
        tap((session) => {
          this.state.set(session);
          this.lastNicknameState.set(session.nickname);
        }),
      );
  }

  /** Ends the session but remembers the nickname for the next one. */
  clear(): void {
    this.state.set(null);
  }

  /** Forgets both the session and the remembered nickname. */
  reset(): void {
    this.state.set(null);
    this.lastNicknameState.set(null);
  }
}
