import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DemoService } from './demo.service';
import { GameSocketService } from './game-socket.service';
import { GameViewService } from './game-view.service';
import { HistoryService } from './history.service';
import { COLS } from './models/game.constants';
import { TileCode } from './models/match.models';
import { RoomStore } from './room-store';
import { SessionService } from './session.service';

describe('offline demo isolation and lifecycle', () => {
  let demo: DemoService;
  let socket: GameSocketService;
  let rooms: RoomStore;
  let view: GameViewService;
  let sessions: SessionService;
  let history: HistoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.removeItem('bomberman-offline-demo');
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    demo = TestBed.inject(DemoService);
    socket = TestBed.inject(GameSocketService);
    rooms = TestBed.inject(RoomStore);
    view = TestBed.inject(GameViewService);
    sessions = TestBed.inject(SessionService);
    history = TestBed.inject(HistoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    socket.close();
    demo.disable();
    http.verify();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function startPreview(): void {
    demo.enable();
    sessions.create('Ada').subscribe();
    socket.connect(sessions.sessionId()!);
    vi.advanceTimersByTime(3900);
  }

  function playerPosition(): { x: number; y: number } {
    view.snap();
    return view.sample(performance.now()).players[0];
  }

  it('uses normal HTTP and WebSocket paths until the demo is explicitly selected', () => {
    let sockets = 0;
    class SocketStub {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      readyState = 0;
      onopen: (() => void) | null = null;
      onmessage: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      constructor() { sockets++; }
      close() { this.readyState = 3; }
      send() {}
    }
    vi.stubGlobal('WebSocket', SocketStub);

    expect(demo.enabled()).toBe(false);
    sessions.create('Ada').subscribe();
    http.expectOne('/api/sessions').flush({
      sessionId: 'real-session', playerId: 'real-player', nickname: 'Ada', createdAt: new Date().toISOString(),
    });
    history.list().subscribe();
    http.expectOne('/api/matches?limit=20').flush([]);
    socket.connect('real-session');
    expect(sockets).toBe(1);
    expect(socket.status()).toBe('connecting');
  });

  it('runs a local lobby, match, movement, bomb, chat and result without network requests', () => {
    vi.stubGlobal('WebSocket', class { constructor() { throw new Error('demo opened a WebSocket'); } });
    demo.enable();
    sessions.create('Sami').subscribe();
    socket.connect(sessions.sessionId()!);
    expect(socket.status()).toBe('open');
    expect(rooms.room()?.phase).toBe('WAITING');
    expect(rooms.room()?.count).toBe(1);

    vi.advanceTimersByTime(900);
    expect(rooms.room()?.phase).toBe('COUNTDOWN');
    expect(rooms.room()?.count).toBe(2);
    vi.advanceTimersByTime(3000);
    expect(view.match()?.matchId).toBe('demo-match-1');
    expect(view.bufferedSnapshots).toBeGreaterThan(0);

    socket.send({ type: 'MOVE', data: { direction: 'RIGHT' } });
    vi.advanceTimersByTime(132);
    view.snap();
    expect(view.sample(performance.now()).players[0].x).toBeGreaterThan(1.5);
    socket.send({ type: 'STOP', data: {} });
    socket.send({ type: 'PLACE_BOMB', data: {} });
    expect(view.tiles()).toContain(3);
    socket.send({ type: 'CHAT', data: { text: 'Hello' } });
    vi.advanceTimersByTime(650);
    expect(rooms.chat().map((message) => message.text)).toContain('Sample reply: nice move!');

    demo.finish();
    expect(rooms.matchEnd()?.matchId).toBe('demo-match-1');
    let resultCount = 0;
    history.list().subscribe((matches) => { resultCount = matches.length; });
    expect(resultCount).toBe(2); // completed preview plus the labelled sample result
    history.get('demo-match-1').subscribe((result) => {
      expect(result.winner?.nickname).toBe('Sami');
    });
    http.expectNone('/api/sessions');
    http.expectNone('/api/matches');
  });

  it('clears old timers on exit and can start a fresh preview', () => {
    const messages = vi.fn();
    demo.messages$.subscribe(messages);
    demo.enable();
    sessions.create('Ada').subscribe();
    socket.connect(sessions.sessionId()!);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    socket.close();
    const countAfterClose = messages.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(messages).toHaveBeenCalledTimes(countAfterClose);
    expect(view.match()).toBeNull();

    rooms.reset();
    view.reset();
    demo.disable();
    expect(demo.enabled()).toBe(false);
    expect(sessionStorage.getItem('bomberman-offline-demo')).toBeNull();
    demo.enable();
    sessions.create('Ada').subscribe();
    socket.connect(sessions.sessionId()!);
    vi.advanceTimersByTime(3900);
    expect(view.match()?.matchId).toBe('demo-match-2');
    socket.close();
    const countAfterRestartClose = messages.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(messages).toHaveBeenCalledTimes(countAfterRestartClose);
  });

  it('places visible boxes while leaving both spawn exits open and rebuilds the layout', () => {
    startPreview();
    const first = [...view.tiles()];
    expect(first.filter((tile) => tile === TileCode.Block)).toHaveLength(26);
    for (const [col, row] of [[1, 1], [2, 1], [1, 2], [13, 11], [12, 11], [13, 10]]) {
      expect(first[row * COLS + col]).toBe(TileCode.Floor);
    }
    expect(first[1 * COLS + 4]).toBe(TileCode.Block);

    socket.close();
    rooms.reset();
    view.reset();
    sessions.clear();
    startPreview();
    expect(view.tiles()).toEqual(first);
  });

  it('stops the player footprint at a box but permits a route around it', () => {
    startPreview();
    socket.send({ type: 'MOVE', data: { direction: 'RIGHT' } });
    vi.advanceTimersByTime(2000);
    const blocked = playerPosition();
    expect(blocked.x).toBeGreaterThan(3);
    expect(blocked.x).toBeLessThan(3.7); // box begins at column 4

    socket.send({ type: 'MOVE', data: { direction: 'DOWN' } });
    vi.advanceTimersByTime(400);
    expect(playerPosition().y).toBeGreaterThan(2.3);
    socket.send({ type: 'MOVE', data: { direction: 'RIGHT' } });
    vi.advanceTimersByTime(330);
    expect(playerPosition().x).toBeGreaterThan(4.1); // the second row is open
  });
});
