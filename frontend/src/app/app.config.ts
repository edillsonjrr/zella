import { ApplicationConfig, DEFAULT_CURRENCY_CODE, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { PreloadAllModules, provideRouter, withPreloading } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';

import { routes } from './app.routes';

// Moeda, números e datas no padrão brasileiro (R$ 1.234,56).
registerLocaleData(localePt, 'pt-BR');

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Sem withViewTransitions: a tela antiga ficava congelada por cima da nova
    // até a nova carregar (ver styles.scss, "Troca de tela").
    // As telas carregam em segundo plano depois da primeira: trocar de tela
    // não espera o download do pedaço da tela nova.
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideAnimationsAsync(),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'BRL' },
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { floatLabel: 'always', appearance: 'outline' } }
  ]
};
