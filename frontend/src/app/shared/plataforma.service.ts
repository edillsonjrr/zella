import { Injectable } from '@angular/core';
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import type { EmpresaCliente } from './models';

/**
 * Operação da plataforma (tela Empresas). Não passa pelo DataService: o
 * administrador não pertence a empresa nenhuma, então lê a coleção de
 * empresas direto. Fica num serviço próprio para a demonstração trocar
 * (plataforma.service.demo.ts).
 */
@Injectable({ providedIn: 'root' })
export class PlataformaService {
  /** Ouve a lista de empresas, por nome. Devolve a função que para de ouvir. */
  ouvirEmpresas(aoMudar: (empresas: EmpresaCliente[]) => void): () => void {
    return onSnapshot(
      query(collection(db, 'empresasClientes'), orderBy('nome')),
      snap => aoMudar(snap.docs.map(d => d.data() as EmpresaCliente)),
      erro => console.warn('Leitura de empresas encerrada:', erro.message)
    );
  }

  /** A function grava a empresa e o primeiro gestor. */
  async criarEmpresa(dados: { nome: string; gestorNome: string; gestorEmail: string }): Promise<{ id: string }> {
    const criar = httpsCallable<{ nome: string; gestorNome: string; gestorEmail: string }, { id: string }>(functions, 'criarEmpresa');
    return (await criar(dados)).data;
  }

  // As Security Rules só deixam o administrador alterar `nome` e `ativa`.
  renomearEmpresa(id: string, nome: string): Promise<void> {
    return updateDoc(doc(db, 'empresasClientes', id), { nome });
  }

  definirEmpresaAtiva(id: string, ativa: boolean): Promise<void> {
    return updateDoc(doc(db, 'empresasClientes', id), { ativa });
  }
}
