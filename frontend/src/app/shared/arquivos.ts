import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Endereço para mostrar um arquivo do Storage (foto do pedido, fotos do
 * serviço), resolvido com o token de quem está logado. Mora num lugar só
 * para a demonstração trocar por fotos guardadas em memória
 * (arquivos.demo.ts).
 */
export function urlDoArquivo(caminho: string): Promise<string> {
  return getDownloadURL(ref(storage, caminho));
}
