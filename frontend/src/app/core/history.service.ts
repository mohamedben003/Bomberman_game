import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';

import { DemoService } from './demo.service';
import type { MatchDetails, MatchSummary } from './models/match.models';

/** Persisted match history (PROTOCOL.md §2.2 and §2.3). */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly http = inject(HttpClient);
  private readonly demo = inject(DemoService);

  /** Latest completed matches, newest first. The protocol caps the limit at 20. */
  list(limit = 20): Observable<MatchSummary[]> {
    const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
    if (this.demo.enabled()) {
      return of(this.demo.list(safeLimit));
    }
    const params = new HttpParams().set('limit', String(safeLimit));
    return this.http.get<MatchSummary[]>('/api/matches', { params });
  }

  /** One persisted match with corners and remaining lives. */
  get(matchId: string): Observable<MatchDetails> {
    if (this.demo.enabled()) {
      const result = this.demo.get(matchId);
      return result ? of(result) : throwError(() => new HttpErrorResponse({ status: 404 }));
    }
    return this.http.get<MatchDetails>('/api/matches/' + encodeURIComponent(matchId));
  }
}
