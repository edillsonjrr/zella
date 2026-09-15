/**
 * Redimensiona uma imagem pelo canvas e devolve um JPEG em data URL. É o
 * que permite mandar foto de celular dentro de uma chamada de function sem
 * estourar o limite: uma foto de 5 MB vira algumas centenas de KB.
 * Rejeita se o navegador não decodificar o arquivo.
 */
export function reduzirImagem(arquivo: File, ladoMaximo = 1280, qualidade = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, ladoMaximo / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', qualidade));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem')); };
    img.src = url;
  });
}
