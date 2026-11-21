import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { RoomStore } from '../room-store';
import { SessionService } from '../session.service';

/**
 * Protected routes need an in-memory guest session.
 * A refresh loses it, so the player returns to the nickname page with a reason
 * (ARCHITECTURE.md §7.1, TASKS pitfalls).
 */
export const sessionGuard: CanActivateFn = () => {
  const sessions = inject(SessionService);
  const router = inject(Router);
  return sessions.active()
    ? true
    : router.createUrlTree(['/nickname'], {
        queryParams: {
          reason: 'Your session ended (a refresh creates a new guest session). Enter a nickname to join again.',
        },
      });
};

/** Exported for tests: the same rule without Angular's router plumbing. */
export function sessionGuardReason(active: boolean): string | null {
  return active
    ? null
    : 'Your session ended (a refresh creates a new guest session). Enter a nickname to join again.';
}

/** Re-exported so the room guard can share the message shape. */
export const ROOM_MISSING_REASON =
  'You are not in a room yet. Join a room from the nickname page.';
