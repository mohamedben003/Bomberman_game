import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';

import { matchGuard } from './match.guard';
import { roomGuard } from './room.guard';
import { sessionGuard } from './session.guard';
import { GameViewService } from '../game-view.service';
import { RoomStore } from '../room-store';
import { SessionService } from '../session.service';
import type { MatchStartPayload } from '../models/match.models';

function treeUrl(result: unknown): string {
  expect(result instanceof UrlTree).toBe(true);
  return TestBed.inject(Router).serializeUrl(result as UrlTree);
}

describe('route guards', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('sessionGuard sends an anonymous visitor to the nickname page with a reason', () => {
    TestBed.overrideProvider(SessionService, {
      useValue: { active: () => false } as unknown as SessionService,
    });

    const result = TestBed.runInInjectionContext(() => sessionGuard({} as never, {} as never));

    expect(treeUrl(result)).toContain('/nickname?reason=');
  });

  it('sessionGuard allows a live session', () => {
    TestBed.overrideProvider(SessionService, {
      useValue: { active: () => true } as unknown as SessionService,
    });

    const result = TestBed.runInInjectionContext(() => sessionGuard({} as never, {} as never));
    expect(result).toBe(true);
  });

  it('roomGuard sends a player without a room to the nickname page', () => {
    TestBed.overrideProvider(RoomStore, {
      useValue: { joined: () => false } as unknown as RoomStore,
    });

    const result = TestBed.runInInjectionContext(() => roomGuard({} as never, {} as never));
    expect(treeUrl(result)).toContain('/nickname?reason=');
  });

  it('matchGuard returns to the waiting room when no match started yet', () => {
    TestBed.overrideProvider(GameViewService, {
      useValue: { match: () => null } as unknown as GameViewService,
    });
    TestBed.overrideProvider(RoomStore, {
      useValue: { joined: () => true } as unknown as RoomStore,
    });

    const result = TestBed.runInInjectionContext(() => matchGuard({} as never, {} as never));
    expect(treeUrl(result)).toBe('/waiting');
  });

  it('matchGuard allows the game when MATCH_START arrived', () => {
    const started = signal<MatchStartPayload | null>({ matchId: 'm1' } as MatchStartPayload);
    TestBed.overrideProvider(GameViewService, {
      useValue: { match: started } as unknown as GameViewService,
    });
    TestBed.overrideProvider(RoomStore, {
      useValue: { joined: () => true } as unknown as RoomStore,
    });

    const result = TestBed.runInInjectionContext(() => matchGuard({} as never, {} as never));
    expect(result).toBe(true);
  });
});
