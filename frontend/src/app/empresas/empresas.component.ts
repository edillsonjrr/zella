import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../shared/firebase';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import type { EmpresaCliente } from '../shared/models';

/**
 * Tela gerencial da plataforma. Só o administrador chega aqui (ver
 * permissoes.ts), e ela não passa pelo DataService: o administrador não
 * pertence a empresa nenhuma, então lê a coleção de empresas direto.
 *
 * Criar uma empresa é o único caminho de entrada de um cliente novo — a
 * function `criarEmpresa` grava a empresa e o primeiro gestor, e o gestor
 * ganha acesso pelo "Definir ou recuperar senha" da tela de login ou
 * entrando com o Google no mesmo e-mail.
 */
@Component({
  selector: 'app-empresas',
  imports: [
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    IconComponent,
    FlowButtonComponent
  ],
  templateUrl: './empresas.component.html',
  styleUrl: './empresas.component.scss'
})
export class EmpresasComponent {
  private readonly feedback = inject(UiFeedbackService);
  private readonly destroyRef = inject(DestroyRef);

  empresas = signal<EmpresaCliente[]>([]);
  displayedColumns = ['nome', 'gestorEmail', 'situacao', 'acoes'];

  // Listagem: filtro por nome ou e-mail do gestor.
  filtro = signal('');
  empresasFiltradas = computed(() => {
    const termo = this.filtro().trim().toLowerCase();
    const lista = this.empresas();
    if (!termo) return lista;
    return lista.filter(e =>
      e.nome.toLowerCase().includes(termo) || (e.gestorEmail ?? '').toLowerCase().includes(termo)
    );
  });
  totalAtivas = computed(() => this.empresas().filter(e => e.ativa).length);

  // Edição inline do nome. As Security Rules só deixam o administrador
  // alterar `nome` e `ativa` da empresa; o e-mail do primeiro gestor é
  // histórico e não muda por aqui.
  editandoId = signal<string | null>(null);
  nomeEditado = '';
  salvandoEdicao = signal(false);

  nome = '';
  gestorNome = '';
  gestorEmail = '';
  salvando = signal(false);
  erro = signal('');
  sucesso = signal('');

  constructor() {
    const parar = onSnapshot(
      query(collection(db, 'empresasClientes'), orderBy('nome')),
      snap => this.empresas.set(snap.docs.map(d => d.data() as EmpresaCliente)),
      erro => console.warn('Leitura de empresas encerrada:', erro.message)
    );
    this.destroyRef.onDestroy(parar);
  }

  async criar(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }

    this.erro.set('');
    this.sucesso.set('');
    this.salvando.set(true);
    try {
      const criarEmpresa = httpsCallable<
        { nome: string; gestorNome: string; gestorEmail: string },
        { id: string }
      >(functions, 'criarEmpresa');
      await criarEmpresa({ nome: this.nome, gestorNome: this.gestorNome, gestorEmail: this.gestorEmail });

      this.sucesso.set(
        `Empresa "${this.nome}" criada. ${this.gestorNome} já pode entrar com ${this.gestorEmail}: ` +
          'pelo Google, ou clicando em "Definir ou recuperar senha" na tela de login.'
      );
      this.feedback.announce(`Empresa ${this.nome} criada.`);
      form.resetForm();
      this.nome = '';
      this.gestorNome = '';
      this.gestorEmail = '';
    } catch (e) {
      this.erro.set((e as { message?: string }).message ?? 'Não foi possível criar a empresa.');
    } finally {
      this.salvando.set(false);
    }
  }

  editar(empresa: EmpresaCliente): void {
    this.erro.set('');
    this.editandoId.set(empresa.id);
    this.nomeEditado = empresa.nome;
  }

  cancelarEdicao(): void {
    this.editandoId.set(null);
    this.nomeEditado = '';
  }

  async salvarEdicao(empresa: EmpresaCliente): Promise<void> {
    const nome = this.nomeEditado.trim();
    if (!nome) return;
    if (nome === empresa.nome) {
      this.cancelarEdicao();
      return;
    }

    this.salvandoEdicao.set(true);
    try {
      await updateDoc(doc(db, 'empresasClientes', empresa.id), { nome });
      this.feedback.announce(`Empresa renomeada para ${nome}.`);
      this.cancelarEdicao();
    } catch {
      this.erro.set(`Não foi possível renomear a empresa ${empresa.nome}.`);
    } finally {
      this.salvandoEdicao.set(false);
    }
  }

  // Desativar não apaga nada: o próximo login de qualquer usuário da
  // empresa é recusado, e quem já está dentro cai no próximo refresh do
  // token. Reativar devolve tudo como estava.
  async alternarAtiva(empresa: EmpresaCliente): Promise<void> {
    try {
      await updateDoc(doc(db, 'empresasClientes', empresa.id), { ativa: !empresa.ativa });
      this.feedback.announce(`Empresa ${empresa.nome} ${empresa.ativa ? 'desativada' : 'reativada'}.`);
    } catch {
      this.erro.set(`Não foi possível alterar a empresa ${empresa.nome}.`);
    }
  }
}
