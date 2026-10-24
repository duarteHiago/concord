import { getToken } from './api';

/** Abre o seletor de arquivos do sistema e devolve a imagem escolhida. */
export function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * A imagem é animada? GIF, WebP animado (o "GIF" que Tenor, Giphy e o Discord costumam baixar) ou PNG animado.
 * Olha o conteúdo, não o tipo: muito "GIF" baixado da internet é WebP por baixo, ou vem sem tipo.
 */
async function isAnimated(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const text = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (text(0, 4) === 'GIF8') return true;
  // WebP: o bloco VP8X marca animação no bit 2 das flags (e o bloco ANIM vem logo depois)
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return text(12, 16) === 'VP8X' && (head[20] & 0x02) !== 0;
  // PNG animado: tem o bloco acTL antes das imagens
  if (head[0] === 0x89 && text(1, 4) === 'PNG') return text(0, head.length).includes('acTL');
  return false;
}

/**
 * Redimensiona e recorta no centro (quadrado ou numa proporção largura/altura) no próprio navegador antes de enviar,
 * assim a imagem nunca fica esticada onde aparece. Imagens animadas vão como estão: passar pelo canvas guardaria
 * só o primeiro quadro.
 */
export async function prepareImage(file: File, maxSize: number, crop: boolean | number): Promise<Blob> {
  if (file.type === 'image/gif' || (await isAnimated(file))) return file;
  const bitmap = await createImageBitmap(file);
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;
  const aspect = crop === true ? 1 : typeof crop === 'number' ? crop : 0;
  if (aspect) {
    if (sw / sh > aspect) {
      const w = sh * aspect;
      sx = (sw - w) / 2;
      sw = w;
    } else {
      const h = sw / aspect;
      sy = (sh - h) / 2;
      sh = h;
    }
  }
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível processar a imagem'))), 'image/webp', 0.9),
  );
}

export async function uploadImage<T>(path: string, blob: Blob): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'application/octet-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: blob,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
  return data as T;
}
