import type { Type } from '@angular/core';

/**
 * Chave única do modo demonstração. Fora dele (produção e emulador) nada
 * aqui liga: a configuração `demo` do angular.json troca este arquivo por
 * modo.demo.ts, que acende a flag e entrega as peças da demonstração. As
 * telas não perguntam "estou na demonstração?"; só o layout, a tela de
 * entrar e o endereço do QR Code olham para cá.
 */
export const MODO_DEMO = false;

/** Peças que o layout monta no topo (faixa da demonstração). */
export const PECAS_DO_LAYOUT: Type<unknown>[] = [];

/** Entrada sem senha, no lugar do e-mail e senha da tela de login. */
export const ENTRADA_SEM_SENHA: Type<unknown> | null = null;
