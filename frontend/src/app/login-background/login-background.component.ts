import { Component } from '@angular/core';

// Um cartão do fundo: posição, atraso na fila e o que ele "é". Cada cartão
// percorre o fluxo da Zella (Aberto → Orçamento → Aprovado → Executado),
// com a barra de saldo andando junto, e some antes de recomeçar.
interface CartaoFluxo {
  icone: 'chamado' | 'os' | 'orcamento' | 'preventiva';
  lado: 'esq' | 'dir';
  topo: string;
  deslocamento: string;
  atraso: string;
  tamanho: 'md' | 'sm';
}

@Component({
  selector: 'app-login-background',
  standalone: true,
  templateUrl: './login-background.component.html',
  styleUrl: './login-background.component.scss'
})
export class LoginBackgroundComponent {
  // Distribuídos nas duas laterais pra não brigar com o painel do centro.
  // Atrasos escalonados num ciclo de 14 s: sempre há 3 a 4 cartões visíveis.
  readonly cartoes: CartaoFluxo[] = [
    { icone: 'chamado', lado: 'esq', topo: '9%', deslocamento: '6%', atraso: '0s', tamanho: 'md' },
    { icone: 'os', lado: 'dir', topo: '13%', deslocamento: '7%', atraso: '-3.5s', tamanho: 'md' },
    { icone: 'orcamento', lado: 'esq', topo: '34%', deslocamento: '14%', atraso: '-7s', tamanho: 'sm' },
    { icone: 'preventiva', lado: 'dir', topo: '38%', deslocamento: '15%', atraso: '-10.5s', tamanho: 'sm' },
    { icone: 'os', lado: 'esq', topo: '58%', deslocamento: '4%', atraso: '-2s', tamanho: 'md' },
    { icone: 'chamado', lado: 'dir', topo: '62%', deslocamento: '5%', atraso: '-5.5s', tamanho: 'md' },
    { icone: 'preventiva', lado: 'esq', topo: '81%', deslocamento: '12%', atraso: '-9s', tamanho: 'sm' },
    { icone: 'orcamento', lado: 'dir', topo: '84%', deslocamento: '13%', atraso: '-12.5s', tamanho: 'sm' }
  ];

  readonly etapas = ['Aberto', 'Orçamento', 'Aprovado', 'Executado'];

  // Com "reduzir movimento" no sistema, os cartões não deslizam (só aparecem
  // e somem); status, cor e saldo seguem animando.
  readonly movimentoReduzido = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
