// Importação de packs de figurinhas: arquivo .wastickers/.zip (de apps como o Sticker Maker) ou várias
// imagens soltas (a pasta "WhatsApp Stickers" do Android, figurinhas salvas pelo WhatsApp Web...).
import { MAX_PACK_STICKERS, PACK_STICKER_MAX_BYTES } from '../../../shared/cosmetics.ts';
import { api } from './api';
import type { StickerPack } from './types';
import { prepareImage, uploadImage } from './upload';
import { readZip } from './zip';

export interface PackDraft {
  name: string;
  author: string;
  images: File[];
}

const IMAGE_RE = /\.(webp|png|gif|jpe?g)$/i;
const ARCHIVE_RE = /\.(wastickers|zip)$/i;
const MIME: Record<string, string> = { webp: 'image/webp', png: 'image/png', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const base = (path: string) => path.split('/').pop()!;
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const mimeOf = (name: string) => MIME[name.split('.').pop()!.toLowerCase()] ?? '';

/** Junta o que a pessoa escolheu (arquivos de pack e/ou imagens) num rascunho de pack. */
export async function readStickerFiles(input: File[]): Promise<PackDraft> {
  const draft: PackDraft = { name: '', author: '', images: [] };
  for (const file of input) {
    if (ARCHIVE_RE.test(file.name) || file.type === 'application/zip') {
      const pack = await readArchive(file);
      draft.name ||= pack.name;
      draft.author ||= pack.author;
      draft.images.push(...pack.images);
    } else if (IMAGE_RE.test(file.name) || file.type.startsWith('image/')) {
      draft.images.push(file);
    }
  }
  return draft;
}

async function readArchive(file: File): Promise<PackDraft> {
  const files = await readZip(await file.arrayBuffer());
  const keys = [...files.keys()].filter((k) => !k.includes('__MACOSX') && !base(k).startsWith('._'));
  const find = (name: string) => keys.find((k) => base(k).toLowerCase() === name);
  const text = async (name: string) => {
    const key = find(name);
    return key ? (await files.get(key)!.text()).trim() : '';
  };

  let name = await text('title.txt');
  let author = await text('author.txt');
  let tray = '';
  let order: string[] | null = null;
  // formato do exemplo oficial do WhatsApp: contents.json com nome, autor, ícone e a ordem das figurinhas
  const contents = find('contents.json');
  if (contents) {
    try {
      const pack = JSON.parse(await files.get(contents)!.text())?.sticker_packs?.[0];
      name ||= String(pack?.name ?? '');
      author ||= String(pack?.publisher ?? '');
      tray = String(pack?.tray_image_file ?? '');
      if (Array.isArray(pack?.stickers)) order = pack.stickers.map((s: { image_file?: unknown }) => String(s.image_file ?? ''));
    } catch {
      // contents.json quebrado: segue pelos arquivos
    }
  }

  let images = keys.filter((k) => IMAGE_RE.test(k));
  if (order) {
    images = order.map((f) => images.find((k) => base(k) === f)).filter((k): k is string => !!k);
  } else {
    images = images.filter((k) => base(k) !== tray && !/^tray/i.test(base(k)));
    // no WhatsApp toda figurinha é .webp; um .png junto é o ícone do pack
    const webp = images.filter((k) => /\.webp$/i.test(k));
    if (webp.length >= 3) images = webp;
    images.sort(natural);
  }
  return {
    name: name || file.name.replace(ARCHIVE_RE, ''),
    author,
    images: images.map((k) => new File([files.get(k)!], base(k), { type: mimeOf(k) })),
  };
}

/** WebP animado: bloco VP8X com o bit de animação ligado. */
function isAnimatedWebp(head: Uint8Array) {
  const ascii = (a: number, b: number) => String.fromCharCode(...head.subarray(a, b));
  return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' && ascii(12, 16) === 'VP8X' && (head[20] & 0x02) !== 0;
}

/**
 * O que sobe de cada figurinha. WebP (o formato do WhatsApp) e GIF vão como estão: redesenhar no navegador
 * apagaria a animação. Fotos (PNG/JPG) e WebP parado grande demais viram WebP de até 512 px.
 * Devolve null quando não dá: animada maior que o limite.
 */
async function prepareSticker(file: File): Promise<Blob | null> {
  const webp = file.type === 'image/webp' || /\.webp$/i.test(file.name);
  const gif = file.type === 'image/gif' || /\.gif$/i.test(file.name);
  if ((webp || gif) && file.size <= PACK_STICKER_MAX_BYTES) return file;
  if (gif || (webp && isAnimatedWebp(new Uint8Array(await file.slice(0, 32).arrayBuffer())))) return null;
  return prepareImage(file, 512, false);
}

export interface UploadResult {
  sent: number;
  /** não entraram: animadas grandes demais, formato inválido ou além do limite do pack */
  skipped: number;
}

/** Sobe figurinhas para um pack da pessoa, uma por vez (dá para mostrar o progresso). */
export async function uploadStickers(packId: string, files: File[], room: number, onProgress: (done: number, total: number) => void): Promise<UploadResult> {
  const list = files.slice(0, Math.max(0, room));
  let sent = 0;
  for (let i = 0; i < list.length; i++) {
    try {
      const blob = await prepareSticker(list[i]);
      if (blob) {
        await uploadImage(`/sticker-packs/${packId}/stickers`, blob);
        sent++;
      }
    } catch {
      // uma figurinha ruim não para a importação
    }
    onProgress(i + 1, list.length);
  }
  return { sent, skipped: files.length - sent };
}

/** Cria o pack e sobe as figurinhas. Se nenhuma entrar, o pack vazio é desfeito. */
export async function importPack(draft: PackDraft, onProgress: (done: number, total: number) => void): Promise<UploadResult & { pack: StickerPack }> {
  const pack = await api.post<StickerPack>('/sticker-packs', { name: draft.name.trim(), author: draft.author });
  const result = await uploadStickers(pack.id, draft.images, MAX_PACK_STICKERS, onProgress);
  if (!result.sent) {
    await api.del(`/sticker-packs/${pack.id}`).catch(() => {});
    throw new Error('Nenhuma figurinha pôde ser importada (formato não suportado ou arquivos grandes demais).');
  }
  return { ...result, pack };
}
