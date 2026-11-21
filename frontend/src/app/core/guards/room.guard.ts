import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { RoomStore } from '../room-store';
import { ROOM_MISSING_REASON } from './session.guard';

/**
 * The game page needs a joined room. Without one, the player goes back to the
 * nickname page with an explanation (ARCHITECTURE.md §7.1).
 */
export const roomGuard: CanActivateFn = () => {
  const rooms = inject(RoomStore);
  const router = inject(Router);
  return rooms.joined()
    ? true
    : router.createUrlTree(['/nickname'], { queryParams: { reason: ROOM_MISSING_REASON } });
};
