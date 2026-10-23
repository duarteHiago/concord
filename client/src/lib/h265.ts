// H.265 (HEVC) na transmissão de tela: o que este navegador/PC consegue fazer e, quando não consegue
// assistir, o motivo provável. Usado pelo seletor de transmissão, pela sala de voz e pela página
// pública /compatibilidade. No Chromium o H.265 do WebRTC é só pela placa de vídeo (não existe
// codificador/decodificador por software), então "o navegador anuncia" já quer dizer "tem hardware".

const hasMime = (kind: 'sender' | 'receiver') => {
  try {
    const caps = kind === 'sender' ? RTCRtpSender.getCapabilities?.('video') : RTCRtpReceiver.getCapabilities?.('video');
    return !!caps?.codecs.some((c) => c.mimeType.toLowerCase() === 'video/h265');
  } catch {
    return false;
  }
};

/** Se este navegador consegue transmitir (codificar) e assistir (decodificar) H.265. Síncrono e barato. */
export function h265Support(): { encode: boolean; decode: boolean } {
  return { encode: hasMime('sender'), decode: hasMime('receiver') };
}

// ------------------------------------------------------------------ placa de vídeo

export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'apple';

export interface GpuInfo {
  /** nome legível (ex.: "NVIDIA GeForce GTX 1060 6GB"), null se o navegador esconde */
  name: string | null;
  vendor: GpuVendor | null;
  /** o navegador está desenhando sem a placa de vídeo (aceleração por hardware desligada ou driver genérico) */
  software: boolean;
}

/** "ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB (0x00001C03) Direct3D11 vs_5_0 ps_5_0, D3D11)" → "NVIDIA GeForce GTX 1060 6GB" */
export function cleanGpuName(renderer: string): string {
  let name = renderer.trim();
  const angle = /^ANGLE \((.*)\)$/i.exec(name);
  if (angle) {
    const parts = angle[1].split(', ');
    name = parts.length > 1 ? parts[1] : parts[0];
  }
  return name
    .replace(/^ANGLE Metal Renderer:\s*/i, '')
    .replace(/\s*\(0x[0-9a-f]+\).*$/i, '')
    .replace(/\s+Direct3D.*$/i, '')
    .replace(/\((R|TM)\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function gpuVendor(name: string): GpuVendor | null {
  if (/nvidia|geforce|quadro|\brtx\b/i.test(name)) return 'nvidia';
  if (/\bamd\b|radeon|\bati\b/i.test(name)) return 'amd';
  if (/intel|\biris\b|\barc\b/i.test(name)) return 'intel';
  if (/apple/i.test(name)) return 'apple';
  return null;
}

const SOFTWARE_RENDERER = /swiftshader|basic render|llvmpipe|softpipe|software/i;

let gpuCache: GpuInfo | null = null;

/** Lê a placa pelo WebGL (rápido; no app desktop também funciona). Não usa o getGPUInfo do Electron: é lento e já travou transmissão. */
export function detectGpu(): GpuInfo {
  if (gpuCache) return gpuCache;
  let renderer = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    // sem WebGL: trata como sem aceleração
  }
  const software = !renderer || SOFTWARE_RENDERER.test(renderer);
  const name = renderer && !software ? cleanGpuName(renderer) : null;
  // o Firefox às vezes devolve só um nome genérico ("Mozilla", "GeForce GTX 980, or similar")
  const usable = name && !/^(mozilla|webkit)/i.test(name) ? name.replace(/, or similar$/i, '') : null;
  gpuCache = { name: usable, vendor: usable ? gpuVendor(usable) : null, software };
  return gpuCache;
}

// ------------------------------------------------------------------ tabela de compatibilidade

export type GpuVerdict = 'yes' | 'no' | 'unknown';

/**
 * Decodificação de H.265 pela placa, por geração. Aproximado de propósito: cobre os modelos comuns e
 * devolve "unknown" quando não reconhece (nesse caso o teste do navegador é o que vale).
 */
const GPU_RULES: { vendor: GpuVendor; verdict: GpuVerdict; test: RegExp }[] = [
  // NVIDIA: a partir da GTX 950/960 (Maxwell 2ª geração), e toda Pascal/Turing/Ampere/Ada/Blackwell
  { vendor: 'nvidia', verdict: 'no', test: /gtx\s*9[78]0|9\d0m\b|\bgtx\s*[4-8]\d\d\b|\bgt\s*[1-7]\d\d\b|mx\s*1[13]0|quadro\s*[km]\d/i },
  { vendor: 'nvidia', verdict: 'yes', test: /\brtx\b|gtx\s*1[06]\d\d|gtx\s*9[56]0|\bgt\s*10[34]0|titan\s*(xp?|v|rtx)|mx\s*(150|[2-5]\d0)|quadro\s*[pt]\d|\b[at]\d{3,4}\b/i },
  // AMD: a partir da RX 400 (Polaris) e da R9 Fury; integradas Ryzen ("Radeon Graphics", "Vega 8")
  { vendor: 'amd', verdict: 'yes', test: /rx\s*(4\d\d|5\d\d|vega|[5-9]\d{3})|radeon\s*vii|vega\s*\d+|fury|\bnano\b|radeon\s*graphics|\b[67][0-9]0m\b|radeon\s*pro\s*(w?[5-7]\d{3}|5\d\d)/i },
  { vendor: 'amd', verdict: 'no', test: /hd\s*[5-8]\d{3}|\br[579]\s*[23]\d\d|\br[579]\s*m?2\d\d/i },
  // Intel: a partir da 6ª geração (Skylake: HD Graphics 5xx); UHD, Iris Xe/Plus e Arc
  { vendor: 'intel', verdict: 'yes', test: /\barc\b|iris\s*(xe|plus)|uhd\s*graphics|hd\s*graphics\s*(5[1-8]\d|6[1-4]\d)\b/i },
  { vendor: 'intel', verdict: 'no', test: /hd\s*graphics\s*([2-6]\d{3})\b|iris\s*(pro\s*)?(graphics\s*)?(5[12]00|6[12]00)|gma/i },
  // Apple Silicon: todos
  { vendor: 'apple', verdict: 'yes', test: /apple\s*m\d/i },
];

export function classifyGpu(name: string): GpuVerdict {
  const vendor = gpuVendor(name);
  for (const rule of GPU_RULES) {
    if ((!vendor || rule.vendor === vendor) && rule.test.test(name)) return rule.verdict;
  }
  return 'unknown';
}

/** Resumo por fabricante para a página de compatibilidade. */
export const GPU_TABLE: { vendor: string; yes: string; no: string }[] = [
  { vendor: 'NVIDIA', yes: 'GTX 950 e 960, GTX 10, GTX 16, todas as RTX (20, 30, 40, 50) e MX 150 em diante', no: 'GTX 970/980 e anteriores (série 900 de notebook, 700, 600…), MX 110/130' },
  { vendor: 'AMD', yes: 'RX 400 e 500, RX Vega, R9 Fury, RX 5000, 6000, 7000, 9000 e os gráficos integrados dos Ryzen', no: 'R9/R7 da série 200 e 300 (exceto Fury), Radeon HD' },
  { vendor: 'Intel', yes: 'A partir da 6ª geração do Core (HD Graphics 520, 530, 620, 630…), UHD Graphics, Iris Xe e Arc', no: 'HD Graphics 4000, 4600, 5500, 6000 e anteriores (até a 5ª geração)' },
  { vendor: 'Apple', yes: 'Todos os Macs com chip M1, M2, M3, M4…', no: 'Macs Intel seguem a regra da Intel acima' },
];

export const DRIVER_LINKS: Record<Exclude<GpuVendor, 'apple'>, { label: string; url: string }> = {
  nvidia: { label: 'Drivers da NVIDIA', url: 'https://www.nvidia.com/pt-br/drivers/' },
  amd: { label: 'Drivers da AMD', url: 'https://www.amd.com/pt/support/download/drivers.html' },
  intel: { label: 'Assistente de drivers da Intel', url: 'https://www.intel.com.br/content/www/br/pt/support/detect.html' },
};

/**
 * Link da página de compatibilidade com o que já foi detectado aqui. No app desktop o link abre no
 * navegador do sistema, que testaria outro navegador: o motivo detectado no app vai junto.
 */
export function compatibilityUrl(d?: Pick<H265Diagnosis, 'cause' | 'gpu'>, fromApp = false): string {
  const q = new URLSearchParams();
  if (d?.gpu.name) q.set('gpu', d.gpu.name);
  if (d && d.cause !== 'ok') q.set('motivo', d.cause);
  if (fromApp) q.set('app', '1');
  const s = q.toString();
  return `/compatibilidade${s ? `?${s}` : ''}`;
}

// ------------------------------------------------------------------ diagnóstico

/**
 * Motivo provável de não conseguir assistir em H.265, do mais para o menos certo:
 * - firefox: o Firefox não tem H.265 em chamadas, independente da placa
 * - hwaccel: o navegador está sem a placa de vídeo (aceleração por hardware desligada)
 * - old-gpu: a placa é anterior ao H.265
 * - linux: Chrome/Edge no Linux costumam vir com a decodificação pela placa desligada
 * - driver: a placa deveria conseguir; driver ou navegador desatualizado
 */
export type H265Cause = 'ok' | 'firefox' | 'hwaccel' | 'old-gpu' | 'linux' | 'driver';

export interface H265Diagnosis {
  cause: H265Cause;
  gpu: GpuInfo;
  verdict: GpuVerdict;
  /** o navegador diz que decodifica H.265 */
  decode: boolean;
}

/** `failed`: já se sabe que não decodificou (mesmo que o navegador diga que sim). */
export function diagnoseH265(failed = false): H265Diagnosis {
  const gpu = detectGpu();
  const verdict = gpu.name ? classifyGpu(gpu.name) : 'unknown';
  const { decode } = h265Support();
  const ua = navigator.userAgent;
  let cause: H265Cause;
  if (/Firefox\//.test(ua)) cause = 'firefox';
  else if (gpu.software) cause = 'hwaccel';
  else if (verdict === 'no') cause = 'old-gpu';
  else if (decode && !failed) cause = 'ok';
  else if (/Linux/.test(ua) && !/Android/.test(ua)) cause = 'linux';
  else cause = 'driver';
  return { cause, gpu, verdict, decode };
}

/** Instalador do app desktop (Windows), publicado pelo CI. */
export const APP_DOWNLOAD_URL = '/downloads/Concord-Setup.exe';

/**
 * O app do Concord resolve: ele traz o próprio Chromium, com H.265 e aceleração por hardware ligados.
 * Só faz sentido oferecer fora do app e no Windows (o instalador é só para Windows).
 */
export function appHelps(cause: H265Cause): boolean {
  const ua = navigator.userAgent;
  const inApp = /Electron\//.test(ua);
  return !inApp && /Windows/.test(ua) && (cause === 'firefox' || cause === 'hwaccel');
}

/**
 * Texto de cada motivo, em linguagem de quem não é da área. Usado pelo tutorial da sala e pela página
 * /compatibilidade. `inApp`: quem lê já está no app desktop (não manda baixar o app nem mexer no navegador).
 */
export function causeText(cause: H265Cause, gpuName: string | null, inApp = false): { title: string; body: string; steps?: string[] } {
  const placa = gpuName ? `Sua placa de vídeo (${gpuName})` : 'Sua placa de vídeo';
  switch (cause) {
    case 'firefox':
      return {
        title: 'O Firefox não reproduz este formato',
        body: 'Esta transmissão usa o H.265, um formato de vídeo de alta qualidade que o Firefox não reproduz em chamadas, em nenhum computador.',
        steps: ['Baixe o app do Concord para computador (já vem pronto para o H.265), ou abra o Concord no Google Chrome ou no Microsoft Edge.'],
      };
    case 'hwaccel':
      return inApp
        ? {
            title: 'O app está sem a placa de vídeo',
            body: 'O driver da placa de vídeo não está instalado ou não está funcionando. Sem ele, vídeos em H.265 não rodam.',
            steps: ['Instale o driver da sua placa de vídeo pelo botão abaixo.', 'Reinicie o computador e abra o Concord de novo.'],
          }
        : {
            title: 'O navegador está sem a placa de vídeo',
            body: 'A "aceleração por hardware" está desligada, ou o driver da placa de vídeo não está instalado. Sem ela, vídeos em H.265 não rodam.',
            steps: [
              'No Chrome ou no Edge, abra as Configurações e procure por "aceleração".',
              'Ligue "Usar aceleração gráfica quando disponível" e clique em Reiniciar.',
              'Se já estava ligada, instale o driver da sua placa de vídeo pelo botão abaixo. Outra saída: o app do Concord, que já vem com a aceleração ligada.',
            ],
          };
    case 'old-gpu':
      return {
        title: `${placa} não reproduz H.265`,
        body: 'Ela é anterior a esse formato de vídeo. Atualizar o driver não resolve, mas você pode pedir para quem está transmitindo usar o formato padrão (H.264).',
      };
    case 'linux':
      return {
        title: 'No Linux, o navegador costuma vir sem esse recurso',
        body: 'O Chrome e o Edge para Linux geralmente vêm com a reprodução de vídeo pela placa desligada, e o H.265 depende dela.',
        steps: ['Veja na página de compatibilidade como ligar a aceleração de vídeo no Linux, ou peça para quem está transmitindo usar o H.264.'],
      };
    default:
      return {
        title: `${placa} deveria reproduzir H.265`,
        body: 'Mas o vídeo não abriu aqui. Normalmente é o driver da placa de vídeo ou o navegador desatualizado.',
        steps: ['Atualize o driver da placa de vídeo pelo botão abaixo.', inApp ? 'Atualize o app do Concord e reinicie o computador.' : 'Atualize o navegador e reinicie o computador.'],
      };
  }
}
