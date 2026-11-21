import { Injectable, signal } from '@angular/core';

export interface FpsReading {
  fps: number;
  /** Average frame time in milliseconds. */
  avg: number;
  max: number;
  /** Frames slower than 20 ms / 33 ms inside the measured window. */
  over20: number;
  over33: number;
}

const WINDOW_MS = 250; // refresh at most 4 times per second
const EMPTY: FpsReading = { fps: 0, avg: 0, max: 0, over20: 0, over33: 0 };

/** Measures the game loop and publishes a reading at most 4 times per second. */
@Injectable({ providedIn: 'root' })
export class FpsMeterService {
  private readonly readingState = signal<FpsReading>(EMPTY);
  readonly reading = this.readingState.asReadonly();

  private last = 0;
  private windowStart = 0;
  private frames = 0;
  private sum = 0;
  private max = 0;
  private over20 = 0;
  private over33 = 0;

  /** Call once per rendered frame with `performance.now()`. */
  tick(now: number): void {
    if (this.last === 0) {
      this.last = now;
      this.windowStart = now;
      return;
    }

    const delta = now - this.last;
    this.last = now;
    this.frames++;
    this.sum += delta;
    this.max = Math.max(this.max, delta);
    if (delta > 20) {
      this.over20++;
    }
    if (delta > 33) {
      this.over33++;
    }

    const elapsed = now - this.windowStart;
    if (elapsed < WINDOW_MS) {
      return;
    }

    this.readingState.set({
      fps: Math.round((this.frames * 1000) / elapsed),
      avg: Math.round(this.sum / this.frames),
      max: Math.round(this.max),
      over20: this.over20,
      over33: this.over33,
    });

    this.frames = 0;
    this.sum = 0;
    this.max = 0;
    this.over20 = 0;
    this.over33 = 0;
    this.windowStart = now;
  }

  reset(): void {
    this.last = 0;
    this.windowStart = 0;
    this.frames = 0;
    this.sum = 0;
    this.max = 0;
    this.over20 = 0;
    this.over33 = 0;
    this.readingState.set(EMPTY);
  }
}