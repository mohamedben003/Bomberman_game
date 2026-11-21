import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { FpsReading } from '../../core/fps-meter.service';

/** `?debug` overlay: fps, average/max frame time and slow-frame counts. */
@Component({
  selector: 'app-perf-overlay',
  template: `
    <div class="perf" role="status">
      <span class="perf__fps">{{ reading().fps }} fps</span>
      <span>avg {{ reading().avg }} ms</span>
      <span>max {{ reading().max }} ms</span>
      <span>&gt;20 ms: {{ reading().over20 }}</span>
      <span>&gt;33 ms: {{ reading().over33 }}</span>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerfOverlayComponent {
  readonly reading = input.required<FpsReading>();
}