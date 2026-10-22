// Leitor de .zip mínimo (é o que um .wastickers é por dentro). Usa o descompactador do próprio navegador
// (DecompressionStream), então não precisa de biblioteca. Lê só arquivos guardados sem compressão ou com
// deflate, que é o que todo programa de zip usa; zip64 e arquivos com senha não são suportados.

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;

/** Devolve cada arquivo do zip pelo nome (com pastas, ex.: "pack/01.webp"). */
export async function readZip(buf: ArrayBuffer): Promise<Map<string, Blob>> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  // o fim do diretório central fica nos últimos 22 bytes, mais um comentário opcional de até 64 KB
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('O arquivo não é um .zip válido');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const names = new TextDecoder();
  const files = new Map<string, Blob>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== CENTRAL) throw new Error('O .zip está corrompido');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = names.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    // os dados começam depois do cabeçalho local (30 bytes + nome + extra, que podem diferir do central)
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = new Blob([bytes.slice(start, start + size)]);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob());
  }
  return files;
}
