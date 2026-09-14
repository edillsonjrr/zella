import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall } from 'firebase-functions/v2/https';
import { db, colecao, exigirPerfil, EMPRESAS } from './admin';
import { proximoNumero } from './contadores';
import { registrarLog, type AutorLog } from './logs';
import type { Chamado, PlanoManutencao } from './types';

// A geração roda sem ninguém logado, então a autoria do log é o próprio
// sistema — e fica explícita, pra ninguém confundir com ação de pessoa.
const AUTOR_SISTEMA: AutorLog = {
  uid: 'sistema',
  nome: 'Manutenção preventiva (automático)',
  email: ''
};

function hojeISO(): string {
  return new Date().toISOString().split('T')[0];
}

function somarDias(dataISO: string, dias: number): string {
  const data = new Date(`${dataISO}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().split('T')[0];
}

/**
 * Abre o chamado de um plano cujo prazo chegou e empurra a próxima execução.
 *
 * O id do chamado é determinístico (`prev_{planoId}_{data}`): se a função
 * rodar duas vezes no mesmo dia — retry, deploy, execução manual — a segunda
 * encontra o documento já criado e não duplica nada.
 */
async function gerarChamadoDoPlano(empresaId: string, plano: PlanoManutencao): Promise<'gerado' | 'duplicado' | 'sem-equipamento'> {
  const equipamentoSnap = await colecao(empresaId, 'equipamentos').doc(plano.equipamentoId).get();
  if (!equipamentoSnap.exists) return 'sem-equipamento';
  const equipamento = equipamentoSnap.data()!;

  const chamadoRef = colecao(empresaId, 'chamados').doc(`prev_${plano.id}_${plano.proximaExecucao}`);
  const planoRef = colecao(empresaId, 'planosManutencao').doc(plano.id);

  return db.runTransaction(async (tx) => {
    const existente = await tx.get(chamadoRef);
    if (existente.exists) return 'duplicado';

    const numero = await proximoNumero(tx, empresaId, 'CH');

    const chamado: Chamado = {
      id: chamadoRef.id,
      numero,
      titulo: plano.nome,
      equipamento: equipamento.nome as string,
      descricao: `Manutenção preventiva programada: ${plano.nome}. Gerada automaticamente pelo plano a cada ${plano.periodicidadeDias} dias.`,
      unidadeId: equipamento.unidadeId as string,
      solicitanteId: 'sistema',
      solicitanteNome: 'Manutenção preventiva',
      status: 'Aberto',
      dataCriacao: hojeISO(),
      // O prazo do chamado é a data em que o serviço deveria acontecer —
      // é o que faz a preventiva já nascer com SLA.
      dataVencimento: plano.proximaExecucao,
      possuiFoto: false,
      origem: 'preventiva',
      planoId: plano.id
    };

    tx.set(chamadoRef, chamado);
    tx.update(planoRef, {
      ultimaExecucao: plano.proximaExecucao,
      proximaExecucao: somarDias(plano.proximaExecucao, plano.periodicidadeDias)
    });

    registrarLog(tx, empresaId, AUTOR_SISTEMA, {
      alvo: 'chamado',
      operacao: 'criar',
      descricao: `Chamado ${numero} aberto automaticamente pelo plano "${plano.nome}"`,
      alvoId: chamadoRef.id,
      alvoRotulo: numero,
      detalhes: {
        plano: plano.nome,
        equipamento: equipamento.nome,
        vencimento: plano.proximaExecucao,
        proximaExecucao: somarDias(plano.proximaExecucao, plano.periodicidadeDias)
      }
    });

    return 'gerado';
  });
}

async function processarPlanosVencidos(empresaId: string): Promise<{ gerados: number; duplicados: number; ignorados: number }> {
  const snap = await colecao(empresaId, 'planosManutencao').where('ativo', '==', true).get();
  const hoje = hojeISO();
  let gerados = 0, duplicados = 0, ignorados = 0;

  for (const doc of snap.docs) {
    const plano = doc.data() as PlanoManutencao;
    // Vence dentro da janela de antecedência? Comparação de string funciona
    // porque as datas estão em ISO (YYYY-MM-DD), que ordena lexicograficamente.
    const limite = somarDias(hoje, plano.antecedenciaDias);
    if (plano.proximaExecucao > limite) continue;

    // Um plano por transação: se um falhar, os outros seguem.
    try {
      const r = await gerarChamadoDoPlano(empresaId, plano);
      if (r === 'gerado') gerados++;
      else if (r === 'duplicado') duplicados++;
      else ignorados++;
    } catch (erro) {
      console.error(`Falha ao gerar chamado do plano ${plano.id}:`, erro);
      ignorados++;
    }
  }

  return { gerados, duplicados, ignorados };
}

// 6h da manhã, horário de Brasília: os chamados já estão abertos quando a
// equipe começa o dia.
export const gerarChamadosPreventivos = onSchedule(
  { schedule: '0 6 * * *', timeZone: 'America/Sao_Paulo' },
  async () => {
    // Uma empresa por vez, cada uma com o próprio resultado no log: a
    // falha de uma não pode segurar as outras.
    const empresas = await db.collection(EMPRESAS).where('ativa', '==', true).get();
    for (const empresa of empresas.docs) {
      try {
        const resultado = await processarPlanosVencidos(empresa.id);
        console.log(`Preventiva [${empresa.id}]:`, resultado);
      } catch (erro) {
        console.error(`Preventiva [${empresa.id}] falhou:`, erro);
      }
    }
  }
);

// Mesma rotina sob demanda — serve pra testar sem esperar o agendamento e
// pra destravar o dia caso a execução automática falhe.
export const rodarPreventivaAgora = onCall(async (request) => {
  const { empresaId } = exigirPerfil(request, ['gestor']);
  return processarPlanosVencidos(empresaId);
});
