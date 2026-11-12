// Conserta a duração do MP4 que o gravador do navegador (MediaRecorder) cria. Ele grava em pedaços
// ("fragmentado") sem saber quanto vai durar, então o cabeçalho sai com duração 0: o player toca, mas não
// mostra o tempo total nem deixa pular para um trecho. Aqui somamos a duração real das amostras de cada
// pedaço (lendo só os cabeçalhos, não o áudio), escrevemos a duração no cabeçalho (mvhd, tkhd, mdhd) e
// acrescentamos a caixa "mehd" (duração total do arquivo fragmentado).
//
// Seguro porque os pedaços do Chrome apontam para os dados a partir do próprio pedaço (default-base-is-moof),
// não por posição no arquivo: aumentar o cabeçalho não desloca nada.

const type = (b: Uint8Array, at: number) => String.fromCharCode(b[at + 4], b[at + 5], b[at + 6], b[at + 7]);

async function read(file: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

interface Head {
  /** onde começa o primeiro pedaço (moof): tudo antes é o cabeçalho (ftyp + moov) */
  headEnd: number;
  head: Uint8Array;
}

/** Soma a duração (em ticks da faixa) de todos os pedaços, lendo só os cabeçalhos deles. */
async function scan(file: Blob): Promise<{ head: Head; ticks: number } | null> {
  let pos = 0;
  let head: Head | null = null;
  let ticks = 0;
  while (pos + 8 <= file.size) {
    const h = await read(file, pos, pos + 16);
    const dv = new DataView(h.buffer);
    let size = dv.getUint32(0);
    if (size === 1) size = Number(dv.getBigUint64(8));
    if (size < 8) break;
    const t = type(h, 0);
    if (t === 'moof') {
      if (!head) head = { headEnd: pos, head: await read(file, 0, pos) };
      ticks += trunTicks(await read(file, pos, pos + size));
    } else if (t !== 'ftyp' && t !== 'moov' && t !== 'mdat' && t !== 'free' && t !== 'skip' && t !== 'sidx') {
      return null; // não é o formato que conhecemos: melhor não mexer
    }
    pos += size;
  }
  return head ? { head, ticks } : null;
}

/** Duração das amostras de um moof (soma de cada trun). */
function trunTicks(moof: Uint8Array): number {
  const dv = new DataView(moof.buffer, moof.byteOffset, moof.byteLength);
  let total = 0;
  const walk = (start: number, end: number, defaultDur: number) => {
    let p = start;
    let defDur = defaultDur;
    while (p + 8 <= end) {
      const size = dv.getUint32(p);
      if (size < 8) return;
      const t = type(moof, p);
      if (t === 'traf') walk(p + 8, p + size, 0);
      else if (t === 'tfhd') {
        const flags = dv.getUint32(p + 8) & 0xffffff;
        let off = p + 16;
        if (flags & 0x1) off += 8;
        if (flags & 0x2) off += 4;
        if (flags & 0x8) defDur = dv.getUint32(off);
      } else if (t === 'trun') {
        const flags = dv.getUint32(p + 8) & 0xffffff;
        const count = dv.getUint32(p + 12);
        let off = p + 16;
        if (flags & 0x1) off += 4;
        if (flags & 0x4) off += 4;
        const each = (flags & 0x100 ? 4 : 0) + (flags & 0x200 ? 4 : 0) + (flags & 0x400 ? 4 : 0) + (flags & 0x800 ? 4 : 0);
        for (let i = 0; i < count; i++) {
          total += flags & 0x100 ? dv.getUint32(off) : defDur;
          off += each;
        }
      }
      p += size;
    }
  };
  walk(8, moof.length, 0);
  return total;
}

/** Novo cabeçalho com a duração certa, ou null se não reconhecer o formato. */
function patchHead(head: Uint8Array, ticks: number): { bytes: Uint8Array; mediaScale: number } | null {
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  let moov = -1;
  for (let p = 0; p + 8 <= head.length; p += dv.getUint32(p)) {
    if (dv.getUint32(p) < 8) return null;
    if (type(head, p) === 'moov') {
      moov = p;
      break;
    }
  }
  if (moov < 0) return null;
  const moovEnd = moov + dv.getUint32(moov);
  // acha as caixas que importam dentro do moov
  const found: Record<string, number> = {};
  const walk = (start: number, end: number) => {
    for (let p = start; p + 8 <= end; ) {
      const size = dv.getUint32(p);
      if (size < 8) return;
      const t = type(head, p);
      if (!(t in found)) found[t] = p;
      if (t === 'trak' || t === 'mdia' || t === 'mvex') walk(p + 8, p + size);
      p += size;
    }
  };
  walk(moov + 8, moovEnd);
  const { mvhd, tkhd, mdhd, mvex } = found;
  if (mvhd === undefined || mdhd === undefined || mvex === undefined) return null;

  const v1 = (at: number) => head[at + 8] === 1;
  const movieScale = v1(mvhd) ? dv.getUint32(mvhd + 28) : dv.getUint32(mvhd + 20);
  const mediaScale = v1(mdhd) ? dv.getUint32(mdhd + 28) : dv.getUint32(mdhd + 20);
  if (!movieScale || !mediaScale) return null;
  const movieDur = Math.round((ticks / mediaScale) * movieScale);

  const out = new Uint8Array(head); // cópia: o original fica como estava
  const odv = new DataView(out.buffer);
  const setDur = (at: number, offV0: number, offV1: number, value: number) => {
    if (v1(at)) odv.setBigUint64(at + offV1, BigInt(value));
    else odv.setUint32(at + offV0, Math.min(value, 0xffffffff));
  };
  setDur(mvhd, 24, 32, movieDur);
  if (tkhd !== undefined) setDur(tkhd, 28, 36, movieDur);
  setDur(mdhd, 24, 32, ticks);

  if (found.mehd !== undefined) {
    setDur(found.mehd, 12, 12, movieDur);
    return { bytes: out, mediaScale };
  }
  // acrescenta o mehd (versão 1, 20 bytes) no começo do mvex; mvex e moov crescem 20 bytes
  const mehd = new Uint8Array(20);
  const mdv = new DataView(mehd.buffer);
  mdv.setUint32(0, 20);
  mehd.set([0x6d, 0x65, 0x68, 0x64], 4); // "mehd"
  mdv.setUint32(8, 0x01000000); // versão 1, flags 0
  mdv.setBigUint64(12, BigInt(movieDur));
  odv.setUint32(moov, dv.getUint32(moov) + 20);
  odv.setUint32(mvex, dv.getUint32(mvex) + 20);
  const at = mvex + 8;
  const result = new Uint8Array(out.length + 20);
  result.set(out.subarray(0, at), 0);
  result.set(mehd, at);
  result.set(out.subarray(at), at + 20);
  return { bytes: result, mediaScale };
}

/**
 * Devolve o arquivo com a duração consertada (como um Blob que referencia o original, sem copiar o áudio
 * para a memória), ou null quando não é um MP4 fragmentado que a gente reconheça.
 */
export async function fixMp4Duration(file: Blob): Promise<{ blob: Blob; seconds: number } | null> {
  try {
    const s = await scan(file);
    if (!s || !s.ticks) return null;
    const patched = patchHead(s.head.head, s.ticks);
    if (!patched) return null;
    return { blob: new Blob([patched.bytes as Uint8Array<ArrayBuffer>, file.slice(s.head.headEnd)], { type: file.type || 'audio/mp4' }), seconds: s.ticks / patched.mediaScale };
  } catch {
    return null;
  }
}
