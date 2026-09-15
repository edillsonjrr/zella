import { HttpsError } from 'firebase-functions/v2/https';
import { getStorage } from 'firebase-admin/storage';

export const FOTO_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Grava uma imagem (data URL base64: jpeg, png ou webp) no Storage e
 * devolve o caminho. A escrita é só daqui: as regras do Storage não deixam
 * o cliente escrever, então qualquer foto passa por uma Cloud Function, que
 * confere tipo e tamanho.
 */
export async function salvarImagem(caminhoSemExtensao: string, dataUrl: string): Promise<string> {
  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(dataUrl ?? '');
  if (!m) {
    throw new HttpsError('invalid-argument', 'A foto precisa ser JPEG, PNG ou WEBP.');
  }
  const [, contentType, extensao, base64] = m;
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > FOTO_MAX_BYTES) {
    throw new HttpsError('invalid-argument', 'A foto passa de 4 MB.');
  }
  const caminho = `${caminhoSemExtensao}.${extensao === 'jpeg' ? 'jpg' : extensao}`;
  await getStorage().bucket().file(caminho).save(bytes, { contentType, resumable: false });
  return caminho;
}
