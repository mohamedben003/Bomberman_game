import { Routes } from '@angular/router';

import { matchGuard } from './core/guards/match.guard';
import { roomGuard } from './core/guards/room.guard';
import { sessionGuard } from './core/guards/session.guard';

/** Route table from ARCHITECTURE.md §7.1. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'nickname' },
  {
    path: 'nickname',
    title: 'Bomberman - nickname',
    loadComponent: () => import('./pages/nickname/nickname.page').then((m) => m.NicknamePage),
  },
  {
    path: 'waiting',
    title: 'Bomberman - waiting room',
    canActivate: [sessionGuard],
    loadComponent: () => import('./pages/waiting/waiting.page').then((m) => m.WaitingPage),
  },
  {
    path: 'game',
    title: 'Bomberman - game',
    canActivate: [sessionGuard, roomGuard, matchGuard],
    loadComponent: () => import('./pages/game/game.page').then((m) => m.GamePage),
  },
  {
    path: 'results/:matchId',
    title: 'Bomberman - results',
    loadComponent: () => import('./pages/results/results.page').then((m) => m.ResultsPage),
  },
  {
    path: 'history',
    title: 'Bomberman - history',
    loadComponent: () => import('./pages/history/history.page').then((m) => m.HistoryPage),
  },
  {
    path: 'history/:matchId',
    title: 'Bomberman - match details',
    loadComponent: () =>
      import('./pages/match-details/match-details.page').then((m) => m.MatchDetailsPage),
  },
  { path: '**', redirectTo: 'nickname' },
];
