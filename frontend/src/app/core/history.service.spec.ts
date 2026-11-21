import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { HistoryService } from './history.service';

describe('HistoryService', () => {
  let service: HistoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HistoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks for at most the latest 20 matches', () => {
    service.list(50).subscribe();

    const request = http.expectOne(
      (candidate) => candidate.url === '/api/matches' && candidate.params.get('limit') === '20',
    );
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('fetches one match by id with the id encoded', () => {
    service.get('8b0d 1f8e').subscribe();

    const request = http.expectOne('/api/matches/8b0d%201f8e');
    expect(request.request.method).toBe('GET');
    request.flush({});
  });
});
