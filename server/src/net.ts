// A "rede" de um endereço IP, para os limites por rede (ver recovery.ts#clientIp e signupGuard.ts). Sem banco nem
// configuração: dá para testar sozinho.

/** Os 8 grupos de um IPv6 (com o "::" aberto), ou null se não for um IPv6 comum. */
function ipv6Groups(ip: string): string[] | null {
  const parts = ip.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  if (parts.length === 1 && head.length !== 8) return null;
  const fill = 8 - head.length - tail.length;
  if (fill < 0 || [...head, ...tail].some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return [...head, ...Array<string>(fill).fill('0'), ...tail];
}

/** IPv4 escrito como IPv6 (::ffff:1.2.3.4) vira o IPv4; o "%interface" do fim sai. */
const clean = (ip: string) => ip.replace(/%.*$/, '').replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, '$1');

export const isIpv6 = (ip: string) => clean(ip).includes(':');

/**
 * O IPv4 inteiro, ou só o começo do IPv6 (`bits`). Uma casa ou uma máquina na nuvem recebe um bloco IPv6 /64
 * inteiro (bilhões de endereços): contando o endereço completo, bastaria trocar o final para fugir do limite.
 */
export function networkOf(rawIp: string, bits: 48 | 64 = 64): string {
  const ip = clean(rawIp);
  const groups = ip.includes(':') ? ipv6Groups(ip) : null;
  if (!groups) return ip;
  return `${groups.slice(0, bits / 16).map((g) => parseInt(g, 16).toString(16)).join(':')}::/${bits}`;
}
