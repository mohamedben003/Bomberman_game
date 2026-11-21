import { TestBed } from '@angular/core/testing';

import { GameSocketService } from './game-socket.service';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  readonly sent: string[] = [];
  closedWith: { code: number; reason: string } | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  receive(raw: string): void {
    this.onmessage?.({ data: raw } as MessageEvent);
  }

  send(raw: string): void {
    this.sent.push(raw);
  }

  close(code = 1000, reason = ''): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.closedWith = { code, reason };
    this.onclose?.({ code, reason } as CloseEvent);
  }
}

function installFakeWebSocket(): void {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
}

describe('GameSocketService', () => {
  let service: GameSocketService;

  beforeEach(() => {
    installFakeWebSocket();
    TestBed.configureTestingModule({});
    service = TestBed.inject(GameSocketService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens exactly one socket even when connect is called twice', () => {
    service.connect('session-1');
    service.connect('session-1');

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(service.status()).toBe('connecting');
  });

  it('replaces an open socket when a different session connects', () => {
    service.connect('session-1');
    const oldSocket = FakeWebSocket.instances[0];
    oldSocket.open();

    service.connect('session-2');
    const newSocket = FakeWebSocket.instances[1];
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(oldSocket.closedWith?.reason).toBe('new session');

    newSocket.open();
    expect(JSON.parse(newSocket.sent[0])).toEqual({
      type: 'JOIN',
      data: { sessionId: 'session-2' },
    });
  });

  it('sends JOIN as the first frame once the socket opens', () => {
    service.connect('session-1');
    const socket = FakeWebSocket.instances[0];
    socket.open();

    expect(service.status()).toBe('open');
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'JOIN',
      data: { sessionId: 'session-1' },
    });
  });

  it('ignores a late close callback from a socket that was replaced', () => {
    service.connect('session-1');
    const oldSocket = FakeWebSocket.instances[0];
    const oldOnClose = oldSocket.onclose;
    oldSocket.open();
    expect(service.status()).toBe('open');

    service.close('left the room');
    service.connect('session-2');
    const newSocket = FakeWebSocket.instances[1];
    newSocket.open();
    expect(service.status()).toBe('open');

    // The previous socket fires its close handler after the new connection exists.
    oldOnClose?.({ code: 1006, reason: 'stale' } as CloseEvent);

    expect(service.status()).toBe('open');
    expect(service.closeReason()).toBeNull();
    service.send({ type: 'STOP', data: {} });
    expect(newSocket.sent.map((frame) => JSON.parse(frame).type)).toEqual(['JOIN', 'STOP']);
  });

  it('records a close reason and does not auto-reconnect', () => {
    service.connect('session-1');
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.close(1001, 'server gone');

    expect(service.status()).toBe('closed');
    expect(service.closeReason()).toBe('server gone');
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('closes on purpose without letting the socket callback overwrite the reason', () => {
    service.connect('session-1');
    const socket = FakeWebSocket.instances[0];
    socket.open();

    service.close('match finished');

    expect(socket.closedWith?.reason).toBe('match finished');
    expect(service.status()).toBe('closed');
    expect(service.closeReason()).toBe('match finished');
  });

  it('drops binary and malformed frames instead of emitting them', () => {
    const received: unknown[] = [];
    service.messages$.subscribe((message) => received.push(message));
    service.connect('session-1');
    const socket = FakeWebSocket.instances[0];
    socket.open();

    socket.onmessage?.({ data: new ArrayBuffer(4) } as MessageEvent);
    socket.receive('not json');
    socket.receive(JSON.stringify({ type: 'NOPE', data: {} }));

    expect(received).toHaveLength(0);
  });
});
