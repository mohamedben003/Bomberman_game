import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the trimmed nickname and keeps the session in memory', () => {
    service.create('  Ada  ').subscribe();

    const request = http.expectOne('/api/sessions');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ nickname: 'Ada' });
    request.flush({
      sessionId: 's1',
      playerId: 'p1',
      nickname: 'Ada',
      createdAt: '2026-11-09T10:15:30Z',
    });

    expect(service.sessionId()).toBe('s1');
    expect(service.nickname()).toBe('Ada');
    expect(service.active()).toBe(true);
    expect(service.lastNickname()).toBe('Ada');
  });

  it('keeps the last nickname after clearing so play again can pre-fill it', () => {
    service.create('Ada').subscribe();
    http.expectOne('/api/sessions').flush({
      sessionId: 's1',
      playerId: 'p1',
      nickname: 'Ada',
      createdAt: '2026-11-09T10:15:30Z',
    });

    service.clear();

    expect(service.active()).toBe(false);
    expect(service.lastNickname()).toBe('Ada');
  });

  it('reset forgets both the session and the nickname', () => {
    service.create('Ada').subscribe();
    http.expectOne('/api/sessions').flush({
      sessionId: 's1',
      playerId: 'p1',
      nickname: 'Ada',
      createdAt: '2026-11-09T10:15:30Z',
    });

    service.reset();

    expect(service.active()).toBe(false);
    expect(service.lastNickname()).toBeNull();
  });
});
