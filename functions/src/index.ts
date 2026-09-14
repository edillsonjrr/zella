import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({ region: 'southamerica-east1', maxInstances: 10 });

export { criarChamado, atribuirResponsavelChamado } from './chamados';
export { criarOS, atribuirTecnicoOS } from './ordensServico';
export { criarOrcamento, aprovarOrcamento, rejeitarOrcamento } from './orcamentos';
export { executarOS, encerrarChamado } from './execucao';
export { validarImportacaoContratos, importarContratos } from './contratos';
export { abrirChamadoQr, validarQrToken } from './qrLinks';
export { gerarChamadosPreventivos, rodarPreventivaAgora } from './preventiva';
export { carregarPerfil, sincronizarClaimsUsuario, prepararAcessoPorSenha, criarEmpresa, reconstruirUsuariosPublicos } from './perfis';
export { cancelarChamado, reabrirChamado } from './fluxoChamado';
export { aditivarContrato, encerrarContrato } from './aditivos';
