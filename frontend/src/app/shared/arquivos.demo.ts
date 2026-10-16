/**
 * Demonstração: as fotos ficam dentro do próprio registro, como data URL
 * reduzida (demo/imagem.ts), no lugar do caminho do Storage. O endereço de
 * leitura é ela mesma. Caminho de Storage de verdade não existe aqui: a
 * tela trata a recusa como "sem foto", igual a um arquivo que sumiu.
 */
export function urlDoArquivo(caminho: string): Promise<string> {
  return caminho.startsWith('data:image/') ? Promise.resolve(caminho) : Promise.reject(new Error('Foto indisponível na demonstração.'));
}
