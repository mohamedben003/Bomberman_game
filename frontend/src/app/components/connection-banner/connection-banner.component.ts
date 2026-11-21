import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { SocketStatus } from '../../core/game-socket.service';

/** Visible connection state; the app never reconnects on its own. */
@Component({
  selector: 'app-connection-banner',
  template: `
    @if (text(); as message) {
      <p class="conn-banner" [class.conn-banner--error]="status() !== 'connecting'" role="status">
        {{ message }}
      </p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionBannerComponent {
  readonly status = input<SocketStatus>('idle');
  readonly message = input<string | null>(null);

  protected readonly text = computed<string | null>(() => {
    switch (this.status()) {
      case 'connecting':
        return 'Connecting to the game server...';
      case 'error':
        return 'Connection problem. The game stops rather than continue with stale data.';
      case 'closed':
        return this.message() ?? 'Disconnected from the game server.';
      default:
        return null;
    }
  });
}