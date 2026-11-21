import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { GameViewService } from '../game-view.service';
import { RoomStore } from '../room-store';
import { ROOM_MISSING_REASON } from './session.guard';

/**
 * The live game route needs an active match that arrived over the socket.
 * A manual visit before `MATCH_START` returns to the waiting room; with no room
 * at all it returns to the nickname page with a reason.
 */
export const matchGuard: CanActivateFn = () => {
  const view = inject(GameViewService);
  const rooms = inject(RoomStore);
  const router = inject(Router);

  if (view.match()) {
    return true;
  }
  return rooms.joined()
    ? router.createUrlTree(['/waiting'])
    : router.createUrlTree(['/nickname'], { queryParams: { reason: ROOM_MISSING_REASON } });
};
