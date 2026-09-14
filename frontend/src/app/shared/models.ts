// Tipos do domínio: fonte única em shared/dominio.ts (raiz do projeto,
// compartilhado com as Cloud Functions). Aqui ficam só os tipos que existem
// apenas no frontend.
export * from '../../../../shared/dominio';

// Cliente da plataforma. Todas as demais coleções vivem dentro do documento
// dele (empresasClientes/{id}/...), e é isso que isola um cliente do outro.
export interface EmpresaCliente {
  id: string;
  nome: string;
  ativa: boolean;
  gestorEmail?: string;
}

// Alvo genérico pro dialog de QR Code: qualquer um dos 4 níveis mapeáveis
// (unidade, bloco, sala, equipamento) sabe se descrever com esses 4 campos.
export type QrAlvoTipo = 'unidade' | 'bloco' | 'sala' | 'equipamento';

export interface QrAlvo {
  tipo: QrAlvoTipo;
  id: string;
  titulo: string;
  subtitulo: string;
}
