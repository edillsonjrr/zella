/**
 * Encolhe uma foto (data URL) para caber no armazenamento do navegador. No
 * app de verdade a foto vai para o Storage com até 1280 px; na
 * demonstração ela fica dentro dos dados, então sai pequena e leve.
 * Devolve vazio se o navegador não conseguir ler a imagem: o registro segue
 * sem foto em vez de falhar.
 */
export async function reduzirFotoDemo(dataUrl: string, ladoMaximo = 480, qualidade = 0.6): Promise<string> {
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const escala = Math.min(1, ladoMaximo / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * escala));
    canvas.height = Math.max(1, Math.round(img.height * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', qualidade);
  } catch {
    return '';
  }
}
