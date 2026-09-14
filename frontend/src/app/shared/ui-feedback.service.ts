import { Injectable, inject } from '@angular/core';
import { LiveAnnouncer } from '@angular/cdk/a11y';

@Injectable({ providedIn: 'root' })
export class UiFeedbackService {
  private readonly liveAnnouncer = inject(LiveAnnouncer);

  announce(message: string, politeness: 'polite' | 'assertive' | 'off' = 'polite'): void {
    this.liveAnnouncer.announce(message, politeness);
  }
}
