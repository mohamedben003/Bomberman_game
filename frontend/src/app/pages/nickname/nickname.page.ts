import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';

import { NICKNAME_MAX } from '../../core/models/game.constants';
import type { ApiError } from '../../core/models/api-error';
import { GameViewService } from '../../core/game-view.service';
import { DemoService } from '../../core/demo.service';
import { RoomStore } from '../../core/room-store';
import { SessionService } from '../../core/session.service';

/** Rejects values that are empty once trimmed. */
const trimmedRequired = (control: { value: unknown }) =>
  typeof control.value === 'string' && control.value.trim().length > 0 ? null : { required: true };

/** Length is measured after trimming, exactly like the server (PROTOCOL.md §2.1). */
const trimmedMaxLength = (control: { value: unknown }) => {
  if (typeof control.value !== 'string') {
    return null;
  }
  const length = control.value.trim().length;
  return length > NICKNAME_MAX
    ? { maxlength: { requiredLength: NICKNAME_MAX, actualLength: length } }
    : null;
};

/** Control characters are rejected by the server; catch them before sending. */
const noControlChars = (control: { value: unknown }) =>
  typeof control.value === 'string' && /\p{Cc}/u.test(control.value) ? { controlChars: true } : null;

@Component({
  selector: 'app-nickname-page',
  imports: [ReactiveFormsModule],
  templateUrl: './nickname.page.html',
  styleUrl: './nickname.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NicknamePage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly sessions = inject(SessionService);
  private readonly rooms = inject(RoomStore);
  private readonly view = inject(GameViewService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly demo = inject(DemoService);

  readonly maxLength = NICKNAME_MAX;
  readonly submitting = signal(false);
  readonly serverError = signal<string | null>(null);
  /** Explanation passed by a guard or a fatal JOIN error, e.g. NICKNAME_TAKEN. */
  readonly notice = signal<string | null>(null);

  /** Play again / refresh returns here; the previous nickname is pre-filled. */
  readonly form = this.fb.nonNullable.group({
    nickname: [
      this.sessions.lastNickname() ?? '',
      [trimmedRequired, trimmedMaxLength, noControlChars],
    ],
  });

  ngOnInit(): void {
    this.notice.set(this.route.snapshot.queryParamMap.get('reason'));
  }

  get nickname() {
    return this.form.controls.nickname;
  }

  /** First visible problem, or `null` while the field is still valid. */
  fieldError(): string | null {
    const control = this.nickname;
    if (!control.touched || control.valid) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Enter a nickname.';
    }
    if (control.hasError('maxlength')) {
      return `At most ${NICKNAME_MAX} characters after trimming.`;
    }
    if (control.hasError('controlChars')) {
      return 'Remove control characters.';
    }
    return 'This nickname is not valid.';
  }

  submit(): void {
    this.serverError.set(null);
    this.notice.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.sessions
      .create(this.nickname.value)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          // A new session must never inherit a parked match or the previous room.
          this.rooms.leave();
          this.view.reset();
          void this.router.navigate(['/waiting']);
        },
        error: (error: unknown) => this.serverError.set(this.describe(error)),
      });
  }

  protected startDemo(): void {
    if (!this.nickname.value.trim()) this.nickname.setValue('Player 1');
    this.demo.enable();
    this.submit();
  }

  private describe(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'Something went wrong. Try again.';
    }
    if (error.status === 0) {
      return 'Cannot reach the game server. Is the backend running?';
    }
    const body = error.error as ApiError | null;
    if (body?.code === 'INVALID_NICKNAME') {
      return body.message || 'That nickname is not valid.';
    }
    return body?.message || 'The server could not create your session. Try again.';
  }
}
