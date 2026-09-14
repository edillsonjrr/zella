import type { Chamado } from './models';

// Fase do chamado, derivada do status. O chamado tinha dois campos de
// estado (situacao e status) atualizados à mão em cada function e que
// divergiam; agora só `status` é gravado e a fase é calculada aqui.
export type FaseChamado = 'Aberto' | 'Em atendimento' | 'Finalizado' | 'Cancelado';

export function faseDoChamado(status: Chamado['status']): FaseChamado {
  switch (status) {
    case 'Aberto':
      return 'Aberto';
    case 'Executado':
    case 'Encerrado':
      return 'Finalizado';
    case 'Cancelado':
      return 'Cancelado';
    default:
      return 'Em atendimento';
  }
}
