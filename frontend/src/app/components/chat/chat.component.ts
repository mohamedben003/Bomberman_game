import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { CHAT_MAX_LEN } from '../../core/models/game.constants';
import type { ChatMessage } from '../../core/models/room.models';

/**
 * Room chat.
 *
 * Message text is rendered with interpolation only, never innerHTML, so another
 * player's nickname or message can never inject markup (TASKS hard rule).
 * `focusChange` lets the game page stop the player while the input has focus.
 */
@Component({
  selector: 'app-chat',
  template: `
    <section class="chat panel">
      <h2 class="chat__title">Chat</h2>

      <ol class="chat__list" #list aria-live="polite">
        @for (message of messages(); track message.messageId) {
          <li class="chat__line" [class.chat__line--system]="message.system">
            @if (message.system) {
              <span class="chat__text">{{ message.text }}</span>
            } @else {
              <span class="chat__from">{{ message.from?.nickname }}</span>
              <span class="chat__text">{{ message.text }}</span>
            }
            <time class="chat__time">{{ time(message) }}</time>
          </li>
        }
        @if (messages().length === 0) {
          <li class="chat__empty">No messages yet.</li>
        }
      </ol>

      <form class="chat__form" (submit)="onSubmit($event)">
        <input
          #input
          class="chat__input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          [attr.maxlength]="maxLength"
          [value]="draft()"
          (input)="onInput($event)"
          (focus)="focusChange.emit(true)"
          (blur)="focusChange.emit(false)"
          (keydown.escape)="onEscape($event)"
          [disabled]="disabled()"
          placeholder="Message"
          aria-label="Chat message"
        />
        <button class="btn" type="submit" [disabled]="disabled() || !draft().trim()">
          Send
        </button>
      </form>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent implements AfterViewChecked {
  readonly messages = input.required<readonly ChatMessage[]>();
  readonly disabled = input(false);
  readonly focusChange = output<boolean>();
  readonly send = output<string>();

  protected readonly maxLength = CHAT_MAX_LEN;
  protected readonly draft = signal('');

  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');
  private lastCount = 0;

  /** Focus the message field (Enter on the game page). */
  focusInput(): void {
    this.input()?.nativeElement.focus();
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement | null)?.value ?? '');
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.submit();
  }

  protected onEscape(event: Event): void {
    (event.target as HTMLInputElement | null)?.blur();
  }

  /** Local clock, display only; the server timestamp is the source of truth. */
  protected time(message: ChatMessage): string {
    const date = new Date(message.sentAt);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  ngAfterViewChecked(): void {
    const count = this.messages().length;
    if (count !== this.lastCount) {
      this.lastCount = count;
      const element = this.list()?.nativeElement;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    }
  }

  private submit(): void {
    const text = this.draft().trim();
    if (!text || this.disabled()) {
      return;
    }
    this.send.emit(text);
    this.draft.set('');
  }
}