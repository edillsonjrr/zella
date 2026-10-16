import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { AuthService } from '../shared/auth.service';
import { DataService } from '../shared/data.service';
import { rotuloPerfil } from '../shared/rotulos';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import { baixarArquivo, nomeDeArquivo } from '../shared/pdf/documento-pdf';

/**
 * Dados da própria pessoa. Só o nome é editável aqui (a regra do Firestore
 * deixa cada um trocar só o próprio nome); perfil, e-mail e vínculos são do
 * gestor. A senha muda pelo mesmo e-mail de redefinição da tela de login.
 */
@Component({
  selector: 'app-minha-conta',
  imports: [FormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, IconComponent, FlowButtonComponent],
  templateUrl: './minha-conta.component.html',
  styleUrl: './minha-conta.component.scss'
})
export class MinhaContaComponent {
  private auth = inject(AuthService);
  private dataService = inject(DataService);
  private feedback = inject(UiFeedbackService);

  usuario = this.auth.usuarioLogado;
  // Exportação completa (Z3.3): só o gestor lê todas as coleções.
  podeExportar = this.auth.isGestor();
  exportando = signal(false);
  erroExportacao = signal('');
  nome = this.usuario().nome;
  salvando = signal(false);
  aviso = signal('');
  erro = signal('');

  get perfilRotulo(): string {
    return rotuloPerfil(this.usuario().perfil);
  }

  get unidadeNome(): string {
    return this.dataService.getUnidadeById(this.usuario().unidadeId ?? '')?.nome ?? '';
  }

  get contratadaNome(): string {
    return this.dataService.getEmpresaContratadaById(this.usuario().empresaContratadaId)?.nome ?? '';
  }

  async salvarNome(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    this.erro.set('');
    this.aviso.set('');
    this.salvando.set(true);
    try {
      await this.auth.salvarMeuNome(this.nome.trim());
      this.aviso.set('Nome atualizado. Ele aparece corrigido no próximo login.');
    } catch {
      this.erro.set('Não foi possível salvar o nome.');
    } finally {
      this.salvando.set(false);
    }
  }

  /**
   * Baixa o .zip com uma planilha CSV por coleção. Tudo é montado no
   * navegador, com o que a sessão já lê; os aditivos são lidos na hora.
   */
  async exportar(): Promise<void> {
    if (this.exportando()) return;
    this.erroExportacao.set('');
    this.exportando.set(true);
    try {
      const { montarArquivosExportacao, compactar } = await import('../shared/exportacao');
      const empresa = this.usuario().empresaNome ?? '';
      const arquivos = await montarArquivosExportacao(this.dataService, empresa);
      const zip = await compactar(arquivos);
      const hoje = new Date();
      const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
      baixarArquivo(zip, `zella-dados${empresa ? '-' + nomeDeArquivo(empresa) : ''}-${data}.zip`);
      this.feedback.sucesso(`Exportação pronta: ${arquivos.length - 1} planilhas no arquivo .zip.`);
    } catch (e) {
      console.error('Falha na exportação', e);
      this.erroExportacao.set('Não foi possível montar o arquivo. Confira a internet e tente de novo.');
    } finally {
      this.exportando.set(false);
    }
  }

  async alterarSenha(): Promise<void> {
    this.erro.set('');
    this.aviso.set('');
    try {
      this.aviso.set(await this.auth.enviarEmailDeNovaSenha());
    } catch {
      this.erro.set('Não foi possível enviar o e-mail de redefinição.');
    }
  }
}
