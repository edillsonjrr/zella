import { Injectable } from '@angular/core';
import { AVISO_DEMO } from '../demo/fluxo';
import { EMPRESA_DEMO_ID, EMPRESA_DEMO_NOME } from '../demo/semente';
import type { EmpresaCliente } from './models';

/**
 * Operação da plataforma na demonstração (trocado pela configuração
 * `demo`). Nenhum perfil de exemplo é administrador, então a tela Empresas
 * nem abre; se abrir, mostra só a empresa de exemplo e não cria nada.
 */
@Injectable({ providedIn: 'root' })
export class PlataformaService {
  ouvirEmpresas(aoMudar: (empresas: EmpresaCliente[]) => void): () => void {
    aoMudar([{ id: EMPRESA_DEMO_ID, nome: EMPRESA_DEMO_NOME, ativa: true, gestorEmail: 'carla@senai.br' }]);
    return () => undefined;
  }

  async criarEmpresa(_dados: { nome: string; gestorNome: string; gestorEmail: string }): Promise<{ id: string }> {
    throw new Error(`${AVISO_DEMO} Criar empresa e convidar o gestor precisa do servidor.`);
  }

  async renomearEmpresa(_id: string, _nome: string): Promise<void> {
    throw new Error(AVISO_DEMO);
  }

  async definirEmpresaAtiva(_id: string, _ativa: boolean): Promise<void> {
    throw new Error(AVISO_DEMO);
  }
}
