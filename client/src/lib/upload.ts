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
 * Redimensiona e recorta (quadrado opcional) no próprio navegador antes de enviar.
 * GIFs são enviados como estão para manter a animação.
 */
export async function prepareImage(file: File, maxSize: number, square: boolean): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file);
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (square) {
    const side = Math.min(sw, sh);
    sx = (sw - side) / 2;
    sy = (sh - side) / 2;
    sw = sh = side;
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
