import type { Type } from '@angular/core';
import { DemoEntradaComponent } from '../demo/demo-entrada.component';
import { DemoFaixaComponent } from '../demo/demo-faixa.component';

/** Modo demonstração ligado (ver modo.ts). */
export const MODO_DEMO = true;

export const PECAS_DO_LAYOUT: Type<unknown>[] = [DemoFaixaComponent];

export const ENTRADA_SEM_SENHA: Type<unknown> | null = DemoEntradaComponent;
