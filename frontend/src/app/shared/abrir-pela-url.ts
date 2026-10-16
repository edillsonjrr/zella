import { effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * Abre o painel de um item pedido pela URL (?os=ID, ?chamado=ID...) — é o
 * que a notificação usa para levar ao item exato.
 *
 * Os dados chegam do Firestore depois da tela, então a busca roda dentro de
 * um effect: quando o item aparece no signal, abre uma vez e tira o
 * parâmetro da URL (voltar ou recarregar não reabre). Chamar no construtor
 * do componente (precisa do contexto de injeção).
 */
export function abrirItemDaUrl<T>(param: string, buscar: (id: string) => T | undefined, abrir: (item: T) => void): void {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const pedido = signal<string | null>(null);

  route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(p => pedido.set(p.get(param)));

  effect(() => {
    const id = pedido();
    if (!id) return;
    const item = buscar(id);
    if (!item) return;
    untracked(() => {
      pedido.set(null);
      router.navigate([], { relativeTo: route, queryParams: { [param]: null }, queryParamsHandling: 'merge', replaceUrl: true });
      // Fora do ciclo de detecção em curso: abrir um diálogo no meio dele
      // dispara "expression changed after checked".
      setTimeout(() => abrir(item));
    });
  });
}
