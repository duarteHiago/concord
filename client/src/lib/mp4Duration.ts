// Conserta a duração do MP4 que o gravador do navegador (MediaRecorder) cria. Ele grava em pedaços
// ("fragmentado") sem saber quanto vai durar, então o cabeçalho sai com duração 0: o player toca, mas não
// mostra o tempo total nem deixa pular para um trecho. Aqui somamos a duração real das amostras de cada faixa
// (áudio e, no vídeo da sala, a faixa de vídeo), lendo só os cabeçalhos dos pedaços (não o conteúdo), e
// escrevemos a duração no cabeçalho (mvhd, tkhd e mdhd de cada faixa) mais a caixa "mehd" (duração total do
// arquivo fragmentado).
//
// Seguro porque os pedaços do Chrome apontam para os dados a partir do próprio pedaço (default-base-is-moof),
// não por posição no arquivo: aumentar o cabeçalho não desloca nada. Se aparecer algo fora desse formato, não
// mexe (devolve null e o arquivo fica como veio).

const type = (b: Uint8Array, at: number) => String.fromCharCode(b[at + 4], b[at + 5], b[at + 6], b[at + 7]);

async function read(file: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

/** Duração somada por faixa (track_ID → ticks da faixa). */
type Ticks = Map<number, number>;

async function scan(file: Blob): Promise<{ head: Uint8Array; headEnd: number; ticks: Ticks } | null> {
  let pos = 0;
  let head: Uint8Array | null = null;
  let headEnd = 0;
  const ticks: Ticks = new Map();
  while (pos + 8 <= file.size) {
    const h = await read(file, pos, pos + 16);
    const dv = new DataView(h.buffer);
    let size = dv.getUint32(0);
    if (size === 1) size = Number(dv.getBigUint64(8));
    if (size < 8) break;
    const t = type(h, 0);
    if (t === 'moof') {
      if (!head) {
        head = await read(file, 0, pos);
        headEnd = pos;
      }
      if (!moofTicks(await read(file, pos, pos + size), ticks)) return null;
    } else if (!['ftyp', 'moov', 'mdat', 'free', 'skip', 'sidx'].includes(t)) {
      return null;
    }
    pos += size;
  }
  return head ? { head, headEnd, ticks } : null;
}

/** Soma as durações das amostras de um moof em `out`. false se usar posição absoluta (não dá para mexer). */
function moofTicks(moof: Uint8Array, out: Ticks): boolean {
  const dv = new DataView(moof.buffer, moof.byteOffset, moof.byteLength);
  for (let p = 8; p + 8 <= moof.length; ) {
    const size = dv.getUint32(p);
    if (size < 8) return false;
    if (type(moof, p) === 'traf') {
      let track = 0;
      let defDur = 0;
      for (let q = p + 8; q + 8 <= p + size; ) {
        const s = dv.getUint32(q);
        if (s < 8) return false;
        const t = type(moof, q);
        const flags = dv.getUint32(q + 8) & 0xffffff;
        if (t === 'tfhd') {
          if (flags & 0x1) return false; // base-data-offset absoluto
          track = dv.getUint32(q + 12);
          let off = q + 16;
          if (flags & 0x2) off += 4;
          if (flags & 0x8) defDur = dv.getUint32(off);
        } else if (t === 'trun') {
          const count = dv.getUint32(q + 12);
          let off = q + 16;
          if (flags & 0x1) off += 4;
          if (flags & 0x4) off += 4;
          const each = (flags & 0x100 ? 4 : 0) + (flags & 0x200 ? 4 : 0) + (flags & 0x400 ? 4 : 0) + (flags & 0x800 ? 4 : 0);
          let sum = 0;
          for (let i = 0; i < count; i++) {
            sum += flags & 0x100 ? dv.getUint32(off) : defDur;
            off += each;
          }
          out.set(track, (out.get(track) ?? 0) + sum);
        }
        q += s;
      }
    }
    p += size;
  }
  return true;
}

interface Box {
  at: number;
  size: number;
}

function children(b: Uint8Array, dv: DataView, start: number, end: number): Record<string, Box[]> {
  const out: Record<string, Box[]> = {};
  for (let p = start; p + 8 <= end; ) {
    const size = dv.getUint32(p);
    if (size < 8) break;
    (out[type(b, p)] ??= []).push({ at: p, size });
    p += size;
  }
  return out;
}

/** Novo cabeçalho com as durações certas, ou null se não reconhecer o formato. */
function patchHead(head: Uint8Array, ticks: Ticks): { bytes: Uint8Array; seconds: number } | null {
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const moov = children(head, dv, 0, head.length).moov?.[0];
  if (!moov) return null;
  const inMoov = children(head, dv, moov.at + 8, moov.at + moov.size);
  const mvhd = inMoov.mvhd?.[0];
  const mvex = inMoov.mvex?.[0];
  if (!mvhd || !mvex) return null;
  const v1 = (at: number) => head[at + 8] === 1;
  const movieScale = v1(mvhd.at) ? dv.getUint32(mvhd.at + 28) : dv.getUint32(mvhd.at + 20);
  if (!movieScale) return null;

  const out = new Uint8Array(head);
  const odv = new DataView(out.buffer);
  const setDur = (at: number, offV0: number, offV1: number, value: number) => {
    if (v1(at)) odv.setBigUint64(at + offV1, BigInt(Math.max(0, Math.round(value))));
    else odv.setUint32(at + offV0, Math.min(Math.max(0, Math.round(value)), 0xffffffff));
  };

  let movieDur = 0;
  for (const trak of inMoov.trak ?? []) {
    const t = children(head, dv, trak.at + 8, trak.at + trak.size);
    const tkhd = t.tkhd?.[0];
    const mdia = t.mdia?.[0];
    if (!tkhd || !mdia) return null;
    const mdhd = children(head, dv, mdia.at + 8, mdia.at + mdia.size).mdhd?.[0];
    if (!mdhd) return null;
    const id = v1(tkhd.at) ? dv.getUint32(tkhd.at + 28) : dv.getUint32(tkhd.at + 20);
    const mediaScale = v1(mdhd.at) ? dv.getUint32(mdhd.at + 28) : dv.getUint32(mdhd.at + 20);
    const trackTicks = ticks.get(id) ?? 0;
    if (!mediaScale) return null;
    const dur = (trackTicks / mediaScale) * movieScale;
    setDur(mdhd.at, 24, 32, trackTicks);
    setDur(tkhd.at, 28, 36, dur);
    movieDur = Math.max(movieDur, dur);
  }
  if (!movieDur) return null;
  setDur(mvhd.at, 24, 32, movieDur);

  const mehd = children(head, dv, mvex.at + 8, mvex.at + mvex.size).mehd?.[0];
  if (mehd) {
    setDur(mehd.at, 12, 12, movieDur);
    return { bytes: out, seconds: movieDur / movieScale };
  }
  // acrescenta o mehd (versão 1, 20 bytes) no começo do mvex; mvex e moov crescem 20 bytes
  const box = new Uint8Array(20);
  const bdv = new DataView(box.buffer);
  bdv.setUint32(0, 20);
  box.set([0x6d, 0x65, 0x68, 0x64], 4); // "mehd"
  bdv.setUint32(8, 0x01000000); // versão 1, flags 0
  bdv.setBigUint64(12, BigInt(Math.round(movieDur)));
  odv.setUint32(moov.at, moov.size + 20);
  odv.setUint32(mvex.at, mvex.size + 20);
  const at = mvex.at + 8;
  const result = new Uint8Array(out.length + 20);
  result.set(out.subarray(0, at), 0);
  result.set(box, at);
  result.set(out.subarray(at), at + 20);
  return { bytes: result, seconds: movieDur / movieScale };
}

/**
 * Devolve o arquivo com a duração consertada (um Blob que referencia o original, sem copiar o conteúdo para a
 * memória), ou null quando não é um MP4 fragmentado que a gente reconheça.
 */
export async function fixMp4Duration(file: Blob): Promise<{ blob: Blob; seconds: number } | null> {
  try {
    const s = await scan(file);
    if (!s || !s.ticks.size) return null;
    const patched = patchHead(s.head, s.ticks);
    if (!patched) return null;
    return { blob: new Blob([patched.bytes as Uint8Array<ArrayBuffer>, file.slice(s.headEnd)], { type: file.type || 'video/mp4' }), seconds: patched.seconds };
  } catch {
    return null;
  }
}
