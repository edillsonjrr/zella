import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { db, colecao, exigirPerfil } from './admin';
import { proximoNumero } from './contadores';
import { registrarLog, resolverAutor } from './logs';
import { notificar } from './notificacoes';
import { resolverQrToken, lerQrTokenNaTransacao, marcarQrTokenUsado } from './qrLinks';
import { empresaRef } from './admin';
import type { Chamado, UrgenciaChamado } from './types';

export const SLA_PADRAO_DIAS = 5;

// Prazo padrão dos chamados da empresa, em dias (empresasClientes/{id}.slaDias).
export async function slaDiasDaEmpresa(empresaId: string): Promise<number> {
  const snap = await empresaRef(empresaId).get();
  const v = Number(snap.data()?.['slaDias']);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : SLA_PADRAO_DIAS;
}

export function somarDias(dataISO: string, dias: number): string {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().split('T')[0];
}

export interface CriarChamadoInput {
  titulo: string;
  equipamento: string;
  numeroSerie?: string;
  descricao: string;
  // Só vale para quem está logado de verdade. No fluxo do QR Code é
  // ignorada: a unidade sai do token do QR. O solicitante sai sempre da
  // sessão (claim ou uid anônimo), nunca do corpo.
  unidadeId?: string;
  solicitanteNome: string;
  possuiFoto: boolean;
  // Foto de evidência como data URL (image/jpeg|png|webp, base64). O app
  // reduz a imagem antes de mandar; aqui vale um teto de tamanho.
  foto?: string;
  // Presente quando o formulário foi aberto escaneando um QR Code.
  qrToken?: string;
  // Campos novos, todos opcionais (quem chama com o formato antigo continua
  // funcionando). "Onde fica" em texto livre, a urgência que a pessoa
  // escolheu e o equipamento do cadastro, quando ela escolheu da lista.
  local?: string;
  urgencia?: UrgenciaChamado;
  equipamentoId?: string;
}

export const URGENCIAS: readonly UrgenciaChamado[] = ['baixa', 'media', 'alta'];
export const LOCAL_MAX = 120;

const ROTULO_URGENCIA: Record<UrgenciaChamado, string> = {
  baixa: 'pode esperar',
  media: 'atrapalha o trabalho',
  alta: 'urgente'
};

/**
 * Confere os campos opcionais do pedido e devolve a forma limpa. Fica fora
 * da callable para o teste conferir a regra sem subir o emulador.
 */
export function validarCamposOpcionais(dados: Pick<CriarChamadoInput, 'local' | 'urgencia' | 'equipamentoId'>): {
  local?: string;
  urgencia?: UrgenciaChamado;
  equipamentoId?: string;
} {
  const saida: { local?: string; urgencia?: UrgenciaChamado; equipamentoId?: string } = {};
  if (dados.local !== undefined && dados.local !== null) {
    if (typeof dados.local !== 'string') {
      throw new HttpsError('invalid-argument', 'O campo "Onde fica" precisa ser um texto.');
    }
    const local = dados.local.trim();
    if (local.length > LOCAL_MAX) {
      throw new HttpsError('invalid-argument', `O campo "Onde fica" aceita até ${LOCAL_MAX} letras.`);
    }
    if (local) saida.local = local;
  }
  if (dados.urgencia !== undefined && dados.urgencia !== null && (dados.urgencia as string) !== '') {
    if (!URGENCIAS.includes(dados.urgencia)) {
      throw new HttpsError('invalid-argument', 'Urgência inválida. Use baixa, média ou alta.');
    }
    saida.urgencia = dados.urgencia;
  }
  if (dados.equipamentoId !== undefined && dados.equipamentoId !== null && (dados.equipamentoId as string) !== '') {
    if (typeof dados.equipamentoId !== 'string' || dados.equipamentoId.length > 200) {
      throw new HttpsError('invalid-argument', 'Equipamento inválido.');
    }
    saida.equipamentoId = dados.equipamentoId;
  }
  return saida;
}

const FOTO_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Sobe a foto pro Storage em empresasClientes/{empresa}/chamados/{id}/...
 * e devolve o caminho. A escrita é só daqui (as regras do Storage não
 * deixam cliente escrever): assim o convidado do QR Code consegue anexar
 * foto sem ter permissão nenhuma no bucket.
 */
async function salvarFoto(empresaId: string, chamadoId: string, dataUrl: string): Promise<string> {
  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) {
    throw new HttpsError('invalid-argument', 'A foto precisa ser JPEG, PNG ou WEBP.');
  }
  const [, contentType, extensao, base64] = m;
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > FOTO_MAX_BYTES) {
    throw new HttpsError('invalid-argument', 'A foto passa de 4 MB.');
  }
  const caminho = `empresasClientes/${empresaId}/chamados/${chamadoId}/evidencia.${extensao === 'jpeg' ? 'jpg' : extensao}`;
  await getStorage().bucket().file(caminho).save(bytes, { contentType, resumable: false });
  return caminho;
}

export const criarChamado = onCall<CriarChamadoInput>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login para abrir um chamado.');
  }

  const dados = request.data;
  const convidado = request.auth.token.firebase?.sign_in_provider === 'anonymous';

  // A sessão anônima existe só por causa do QR Code. Sem token, ela não abre
  // chamado nenhum — senão qualquer visitante criaria registros à vontade.
  if (convidado && !dados.qrToken) {
    throw new HttpsError('permission-denied', 'Escaneie o QR Code para abrir um chamado.');
  }

  // A empresa e a unidade do chamado aberto por QR Code vêm do token do QR,
  // nunca do corpo da chamada: é o que torna a trava real e não apenas
  // visual. O solicitante é a sessão que enviou, com o nome que a pessoa
  // digitou. Pra quem está logado, empresa e solicitante saem do claim.
  let empresaId: string;
  let unidadeId: string;
  let solicitanteId: string;
  const opcionais = validarCamposOpcionais(dados);

  if (dados.qrToken) {
    const alvo = await resolverQrToken(dados.qrToken);
    empresaId = alvo.empresaId;
    unidadeId = alvo.unidadeId;
    solicitanteId = request.auth.uid;
    // QR colado num equipamento: o equipamento vem do token, não do corpo.
    opcionais.equipamentoId = alvo.tipo === 'equipamento' ? alvo.id : undefined;
  } else {
    // Pede conserto quem usa o prédio (solicitante) e quem administra
    // (gestor). A empresa contratada e o técnico recebem a OS; não abrem
    // chamado no cliente (Z0.7: o botão "Novo chamado" não aparece para eles).
    const ctx = exigirPerfil(request, ['cliente', 'gestor']);
    if (!dados.unidadeId) {
      throw new HttpsError('invalid-argument', 'Informe a unidade.');
    }
    empresaId = ctx.empresaId;
    unidadeId = dados.unidadeId;
    solicitanteId = ctx.usuarioId;

    // O cliente é amarrado à unidade dele pelo claim do token (ver
    // perfis.ts). O seletor da tela já vem travado, mas é aqui que a trava
    // vale de verdade.
    if (ctx.perfil === 'cliente' && ctx.unidadeId && ctx.unidadeId !== unidadeId) {
      throw new HttpsError('permission-denied', 'O solicitante só abre chamado na própria unidade.');
    }

    // Equipamento escolhido da lista: precisa existir e ser da unidade do
    // chamado. Quem não acha o seu na lista usa "Outro" e descreve.
    if (opcionais.equipamentoId) {
      const equipamento = await colecao(empresaId, 'equipamentos').doc(opcionais.equipamentoId).get();
      if (!equipamento.exists) {
        throw new HttpsError('invalid-argument', 'O equipamento escolhido não está no cadastro. Escolha "Outro" e descreva.');
      }
      if (equipamento.data()?.['unidadeId'] !== unidadeId) {
        throw new HttpsError('invalid-argument', 'O equipamento escolhido é de outra unidade.');
      }
    }
  }

  if (!dados.equipamento || !dados.descricao || !dados.solicitanteNome?.trim()) {
    throw new HttpsError('invalid-argument', 'Preencha equipamento, descrição e seu nome.');
  }

  const solicitanteNome = dados.solicitanteNome.trim().slice(0, 120);

  const chamadoRef = colecao(empresaId, 'chamados').doc();
  const autor = await resolverAutor(request, empresaId, solicitanteNome);

  // Fora da transação: upload não é transacional, e se o chamado falhar
  // depois, sobra um arquivo órfão — barato, e não corrompe nada.
  const fotoPath = dados.foto ? await salvarFoto(empresaId, chamadoRef.id, dados.foto) : undefined;

  // SLA: prazo do chamado em dias, configurável por empresa
  // (empresasClientes/{id}.slaDias). Sem configuração vale o padrão.
  const slaDias = await slaDiasDaEmpresa(empresaId);

  const numero = await db.runTransaction(async (tx) => {
    // Leitura do token junto das outras leituras da transação: um link abre um
    // chamado só, e dois envios simultâneos disputam o mesmo documento.
    if (dados.qrToken) {
      await lerQrTokenNaTransacao(tx, dados.qrToken);
    }

    const numero = await proximoNumero(tx, empresaId, 'CH');
    const hoje = new Date().toISOString().split('T')[0];

    const chamado: Chamado = {
      id: chamadoRef.id,
      numero,
      titulo: dados.titulo || dados.equipamento,
      equipamento: dados.equipamento,
      numeroSerie: dados.numeroSerie,
      descricao: dados.descricao,
      unidadeId,
      solicitanteId,
      solicitanteNome,
      status: 'Aberto',
      dataCriacao: hoje,
      dataVencimento: somarDias(hoje, slaDias),
      possuiFoto: !!fotoPath,
      fotoPath,
      origem: 'manual',
      ...opcionais
    };

    tx.set(chamadoRef, chamado);

    if (dados.qrToken) {
      marcarQrTokenUsado(tx, dados.qrToken);
    }

    registrarLog(tx, empresaId, autor, {
      alvo: 'chamado',
      operacao: 'criar',
      descricao: `Abriu o chamado ${numero} — ${dados.equipamento}`,
      alvoId: chamadoRef.id,
      alvoRotulo: numero,
      detalhes: {
        equipamento: dados.equipamento,
        unidadeId,
        solicitante: solicitanteNome,
        slaDias,
        local: opcionais.local ?? null,
        urgencia: opcionais.urgencia ?? null
      }
    });

    const urgencia = opcionais.urgencia ? ` Urgência: ${ROTULO_URGENCIA[opcionais.urgencia]}.` : '';
    notificar(tx, empresaId, {
      paraPerfil: 'gestor',
      titulo: `Novo chamado ${numero}`,
      texto: `${solicitanteNome} abriu "${dados.equipamento}". Prazo: ${slaDias} ${slaDias === 1 ? 'dia' : 'dias'}.${urgencia}`,
      link: `/dashboard?chamado=${chamadoRef.id}`,
      alvo: { tipo: 'chamado', id: chamadoRef.id, numero }
    });

    return numero;
  });

  return { id: chamadoRef.id, numero };
});

// Responsável é da gestão do cliente: só o gestor escolhe (a tela já era só dele).
export const atribuirResponsavelChamado = onCall<{ chamadoId: string; gestorId: string | null }>(async (request) => {
  const { empresaId } = exigirPerfil(request, ['gestor']);

  const { chamadoId, gestorId } = request.data;
  const chamadoRef = colecao(empresaId, 'chamados').doc(chamadoId);
  const autor = await resolverAutor(request, empresaId);

  // Resolvido fora da transação: o corpo dela pode ser reexecutado em caso
  // de contenção, e esta leitura não precisa repetir junto.
  let nomeGestor = 'ninguém';
  if (gestorId) {
    const gestorSnap = await colecao(empresaId, 'usuarios').doc(gestorId).get();
    nomeGestor = (gestorSnap.data()?.nome as string) ?? gestorId;
  }

  // Virou transação (era um update solto) pra que a atribuição e o registro
  // dela entrem juntos — um log de responsável sem a troca ter acontecido
  // seria pior que não ter log.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(chamadoRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Chamado não encontrado.');
    }
    const chamado = snap.data()!;

    tx.update(chamadoRef, {
      responsavelId: gestorId ?? FieldValue.delete()
    });

    registrarLog(tx, empresaId, autor, {
      alvo: 'chamado',
      operacao: 'editar',
      descricao: gestorId
        ? `Atribuiu o chamado ${chamado.numero} a ${nomeGestor}`
        : `Removeu o responsável do chamado ${chamado.numero}`,
      alvoId: chamadoId,
      alvoRotulo: chamado.numero as string,
      detalhes: { responsavel: { de: chamado.responsavelId ?? null, para: gestorId } }
    });
  });

  return { ok: true };
});
