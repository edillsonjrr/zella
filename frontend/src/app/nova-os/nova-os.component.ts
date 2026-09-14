import { Component, Inject, OnInit, Optional, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DataService } from '../shared/data.service';
import type { Chamado } from '../shared/models';

@Component({
  selector: 'app-nova-os',
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    IconComponent,
    FlowButtonComponent,
    MatDividerModule,
    MatDialogModule
  ],
  templateUrl: './nova-os.component.html',
  styleUrl: './nova-os.component.scss'
})
export class NovaOsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dataService = inject(DataService);

  chamadoOrigem: Chamado | null = null;
  ativo = '';
  numeroSerie = '';
  contratoId = '';
  tecnicoId = '';
  diagnostico = '';

  chamadoIdParam = signal<string | null>(null);
  chamadoSelecionadoId = '';

  // Contrato encerrado ou vencido não recebe OS (o backend recusa também).
  contratos = computed(() => {
    const hoje = new Date().toISOString().split('T')[0];
    return this.dataService.contratos().filter(c => c.status !== 'Encerrado' && (!c.vigenciaFim || c.vigenciaFim >= hoje));
  });
  tecnicos = computed(() => this.dataService.usuarios().filter(u => u.perfil === 'tecnico'));
  chamadosDisponiveis = computed(() => this.dataService.chamados().filter(c => !c.ordemServicoId));

  constructor(
    @Optional() private dialogRef: MatDialogRef<NovaOsComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  get isDialog(): boolean {
    return !!this.dialogRef;
  }

  ngOnInit(): void {
    const params = this.data || {};
    this.chamadoIdParam.set(params.chamadoId || null);
    this.ativo = params.equipamento || '';
    this.numeroSerie = params.serie || '';

    this.route.queryParamMap.subscribe(queryParams => {
      if (!this.isDialog) {
        this.chamadoIdParam.set(queryParams.get('chamadoId') || null);
        this.ativo = queryParams.get('equipamento') || this.ativo;
        this.numeroSerie = queryParams.get('serie') || this.numeroSerie;
      }

      const id = this.chamadoIdParam();
      const chamado = id ? this.dataService.getChamadoById(id) : undefined;
      if (chamado) {
        this.chamadoOrigem = chamado;
        if (!this.ativo) this.ativo = chamado.equipamento;
        if (!this.numeroSerie) this.numeroSerie = chamado.numeroSerie ?? '';
      }
    });
  }

  selecionarChamado(chamadoId: string): void {
    const chamado = this.dataService.getChamadoById(chamadoId);
    if (chamado) {
      this.chamadoOrigem = chamado;
      if (!this.ativo) this.ativo = chamado.equipamento;
      if (!this.numeroSerie) this.numeroSerie = chamado.numeroSerie ?? '';
    }
  }

  salvar(form: NgForm): void {
    if (form.invalid || !this.chamadoOrigem) {
      form.control.markAllAsTouched();
      document.querySelector<HTMLElement>('.modal-scrollable-body .ng-invalid')?.focus();
      return;
    }

    this.dataService.adicionarOS({
      chamadoId: this.chamadoOrigem.id,
      contratoId: this.contratoId,
      tecnicoId: this.tecnicoId
    });

    this.fechar();
  }

  cancelar(): void {
    this.fechar();
  }

  private fechar(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    } else {
      this.router.navigate(['/ordens-servico']);
    }
  }
}
