import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type { MatchDetails, MatchSummary } from './models/match.models';

/** Persisted match history (PROTOCOL.md §2.2 and §2.3). */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly http = inject(HttpClient);

  /** Latest completed matches, newest first. The protocol caps the limit at 20. */
  list(limit = 20): Observable<MatchSummary[]> {
    const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
    const params = new HttpParams().set('limit', String(safeLimit));
    return this.http.get<MatchSummary[]>('/api/matches', { params });
  }

  /** One persisted match with corners and remaining lives. */
  get(matchId: string): Observable<MatchDetails> {
    return this.http.get<MatchDetails>('/api/matches/' + encodeURIComponent(matchId));
  }
}
