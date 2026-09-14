import { Component, DestroyRef, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageLoadingComponent } from './shared/page-loading/page-loading.component';
import { UiFeedbackService } from './shared/ui-feedback.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PageLoadingComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly feedback = inject(UiFeedbackService);

  constructor() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      queueMicrotask(() => {
        const main = document.getElementById('main-content');
        const heading = main?.querySelector('h1')?.textContent?.trim();
        main?.focus();
        if (heading) this.feedback.announce(`${heading}. Página carregada.`);
      });
    });
  }
  title = 'Zella';
}
