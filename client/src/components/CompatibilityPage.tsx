// Página pública /compatibilidade: "meu computador consegue assistir transmissões em H.265?".
// Sem login. Escrita para quem não é da área: primeiro a resposta, depois quais navegadores
// funcionam, como resolver, a tabela de placas e as perguntas. Visual da landing (ver o .css).
// Quando vem do tutorial da sala, chega com a placa e o motivo já detectados.
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Cpu, Download, ExternalLink, Gauge, HelpCircle, Search, Smartphone, Terminal, X, XCircle } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { APP_DOWNLOAD_URL, DRIVER_LINKS, GPU_TABLE, causeText, classifyGpu, diagnoseH265, type H265Cause, type H265Diagnosis } from '../lib/h265';
import { ChromeLogo, ConcordLogo, EdgeLogo, FirefoxLogo, OperaLogo, SafariLogo } from './BrowserLogos';
import './CompatibilityPage.css';

const CAUSES: H265Cause[] = ['ok', 'firefox', 'hwaccel', 'old-gpu', 'linux', 'driver'];
const UA = navigator.userAgent;
const IS_WINDOWS = /Windows/.test(UA);

function readParams() {
  const q = new URLSearchParams(location.search);
  const motivo = q.get('motivo') as H265Cause | null;
  return { gpu: q.get('gpu') ?? '', cause: motivo && CAUSES.includes(motivo) ? motivo : null, fromApp: q.get('app') === '1' };
}

type BrowserId = 'app' | 'chrome' | 'edge' | 'safari' | 'opera' | 'firefox' | 'linux' | 'mobile';

function currentBrowser(): BrowserId | null {
  if (/Electron\//.test(UA)) return 'app';
  if (/Android|iPhone|iPad/.test(UA)) return 'mobile';
  if (/Firefox\//.test(UA)) return 'firefox';
  if (/Linux/.test(UA)) return 'linux';
  if (/Edg\//.test(UA)) return 'edge';
  if (/OPR\//.test(UA)) return 'opera';
  if (/Chrome\//.test(UA)) return 'chrome';
  if (/Safari\//.test(UA)) return 'safari';
  return null;
}

const BROWSERS: { id: BrowserId; name: string; logo: ReactNode; status: 'yes' | 'maybe' | 'no'; label: string; note: string }[] = [
  { id: 'app', name: 'App do Concord', logo: <ConcordLogo />, status: 'yes', label: 'Funciona', note: 'O jeito mais garantido: já vem pronto, com a placa de vídeo ligada. Para Windows.' },
  { id: 'chrome', name: 'Google Chrome', logo: <ChromeLogo />, status: 'yes', label: 'Funciona', note: 'No Windows e no Mac, atualizado e com uma placa de vídeo compatível.' },
  { id: 'edge', name: 'Microsoft Edge', logo: <EdgeLogo />, status: 'yes', label: 'Funciona', note: 'Igual ao Chrome: atualizado e com uma placa compatível.' },
  { id: 'safari', name: 'Safari', logo: <SafariLogo />, status: 'yes', label: 'Funciona', note: 'Nos Macs e iPhones com o sistema atualizado.' },
  { id: 'opera', name: 'Opera, Brave e outros', logo: <OperaLogo />, status: 'maybe', label: 'Costuma funcionar', note: 'São feitos a partir do Chrome, mas cada um liga ou desliga recursos. Faça o teste.' },
  { id: 'linux', name: 'Chrome no Linux', logo: <ChromeLogo />, status: 'maybe', label: 'Precisa de ajuste', note: 'A reprodução pela placa vem desligada. Veja como ligar em "Como resolver".' },
  { id: 'mobile', name: 'Celular', logo: <Smartphone size={40} strokeWidth={1.6} />, status: 'maybe', label: 'Depende do aparelho', note: 'Varia entre modelos. Faça o teste pelo próprio celular.' },
  { id: 'firefox', name: 'Firefox', logo: <FirefoxLogo />, status: 'no', label: 'Não funciona', note: 'Não reproduz H.265 em chamadas, em nenhum computador.' },
];

export default function CompatibilityPage() {
  const params = useMemo(readParams, []);
  const here = useMemo(currentBrowser, []);
  const [result, setResult] = useState<H265Diagnosis | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const runTest = () => {
    setResult(diagnoseH265());
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };

  return (
    <div className="cp">
      <nav className="cp-nav">
        <div className="cp-wrap">
          <a href="/inicio/" aria-label="Concord, página inicial">
            <img src="/brand/concord-logo.png" alt="Concord" width={160} height={36} />
          </a>
          <div className="cp-nav-links">
            <a href="#navegadores">Navegadores</a>
            <a href="#resolver">Como resolver</a>
            <a href="#placas">Placas</a>
            <a href="/">Abrir o Concord</a>
          </div>
          {IS_WINDOWS && here !== 'app' && (
            <a className="cp-btn cp-btn-primary cp-btn-sm" href={APP_DOWNLOAD_URL}>
              Baixar
            </a>
          )}
        </div>
      </nav>

      <header className="cp-hero">
        <div className="cp-wrap">
          <div className="cp-hero-copy">
            <p className="cp-eyebrow">Compatibilidade · H.265</p>
            <h1>
              Será que <b>roda</b> no <em>seu PC?</em>
            </h1>
            <p className="cp-lede">
              Algumas transmissões no Concord usam o H.265: um formato de vídeo que deixa a tela mais nítida usando a mesma internet. Quem reproduz esse
              formato é a placa de vídeo. Descubra em um clique se a sua consegue.
            </p>
            {params.cause && <RoomNote cause={params.cause} gpu={params.gpu || null} fromApp={params.fromApp} />}
            <div className="cp-hero-cta">
              <button className="cp-btn cp-btn-primary" onClick={runTest}>
                <Gauge size={20} /> {result ? 'Testar de novo' : 'Testar meu computador'}
              </button>
              <span className="cp-hero-note">Não instala nada · nada sai do seu PC</span>
            </div>
            {params.fromApp && (
              <p className="cp-small">Você veio pelo app, então esta página abriu no navegador: o teste aqui vale para este navegador, não para o app.</p>
            )}
            <div ref={resultRef}>{result && <TestResult result={result} />}</div>
          </div>
          <Compare />
        </div>
      </header>

      <main className="cp-wrap">
        <section className="cp-section" id="navegadores">
          <div className="cp-section-head">
            <p className="cp-eyebrow">Navegadores</p>
            <h2>Onde funciona</h2>
            <p className="cp-lede">O navegador também conta: ele precisa saber conversar com a placa de vídeo.</p>
          </div>
          <div className="cp-browsers">
            {BROWSERS.map((b) => (
              <div key={b.id} className={`cp-browser${here === b.id ? ' here' : ''}`}>
                {here === b.id && <span className="cp-here">você está aqui</span>}
                <span className="cp-browser-logo">
                  {b.logo}
                  {b.id === 'linux' && <span className="cp-mini">Linux</span>}
                </span>
                <b>{b.name}</b>
                <span className={`cp-status ${b.status}`}>
                  {b.status === 'yes' ? <Check size={13} strokeWidth={3} /> : b.status === 'no' ? <X size={13} strokeWidth={3} /> : <AlertTriangle size={12} strokeWidth={2.6} />}
                  {b.label}
                </span>
                <small>{b.note}</small>
                {b.id === 'app' && IS_WINDOWS && here !== 'app' && (
                  <a className="cp-btn cp-btn-primary" href={APP_DOWNLOAD_URL}>
                    <Download size={16} /> Baixar para Windows
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="cp-section" id="resolver">
          <div className="cp-section-head">
            <p className="cp-eyebrow">Como resolver</p>
            <h2>Não funcionou? Vamos por partes</h2>
            <p className="cp-lede">Abra o seu caso. Se não souber qual é, faça o teste lá em cima: ele aponta o motivo.</p>
          </div>
          <div className="cp-acc">
            <Fix icon={<FirefoxLogo size={24} />} title="Uso o Firefox" open={params.cause === 'firefox'}>
              <Steps cause="firefox" />
              <div className="cp-row">
                {IS_WINDOWS && <AppButton />}
              </div>
            </Fix>
            <Fix icon={<Cpu size={20} />} title="A aceleração por hardware está desligada" open={params.cause === 'hwaccel'}>
              <Steps cause="hwaccel" />
              <div className="cp-row">
                {IS_WINDOWS && <AppButton />}
                <DriverButtons />
              </div>
            </Fix>
            <Fix icon={<AlertTriangle size={20} />} title="Minha placa deveria funcionar, mas não funciona" open={params.cause === 'driver'}>
              <Steps cause="driver" />
              <div className="cp-row">
                <DriverButtons />
              </div>
              <p className="cp-small">
                Não sabe qual é a sua placa? No Windows, aperte <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Esc</kbd>, vá em <b>Desempenho</b> e clique em{' '}
                <b>GPU</b>: o nome aparece no canto de cima.
              </p>
            </Fix>
            <Fix icon={<Terminal size={20} />} title="Uso Linux" open={params.cause === 'linux'}>
              <p>
                O Chrome e o Edge para Linux costumam vir com a reprodução de vídeo pela placa desligada. Instale o driver da sua placa (no Ubuntu, pelo
                aplicativo "Drivers adicionais") e abra o Chrome com a aceleração de vídeo ligada:
              </p>
              <pre>google-chrome --enable-features=VaapiVideoDecoder,VaapiIgnoreDriverChecks</pre>
              <p className="cp-small">
                Para conferir, abra <code>chrome://gpu</code> e procure "Video Decode: Hardware accelerated". Se não aparecer, peça para quem transmite usar o
                H.264.
              </p>
            </Fix>
            <Fix icon={<HelpCircle size={20} />} title="Minha placa é antiga" open={params.cause === 'old-gpu'}>
              <Steps cause="old-gpu" />
              <p className="cp-small">
                Não precisa trocar de computador para usar o Concord: quem transmite pode deixar ligada a opção "Voltar para H.264", e você assiste
                normalmente.
              </p>
            </Fix>
          </div>
        </section>

        <GpuTable initial={params.gpu} />

        <section className="cp-section">
          <div className="cp-section-head">
            <p className="cp-eyebrow">Perguntas</p>
            <h2>Perguntas frequentes</h2>
          </div>
          <div className="cp-acc">
            <Fix title="Por que meu amigo consegue assistir e eu não?">
              <p>
                Quem reproduz o H.265 é a placa de vídeo, não a internet. Se a placa do seu amigo é mais nova, ou o navegador dele está com a aceleração ligada,
                ele consegue e você não, mesmo estando na mesma sala.
              </p>
            </Fix>
            <Fix title="Preciso comprar outra placa de vídeo?">
              <p>
                Não. O H.265 é opcional. Na maioria das transmissões, se alguém não consegue reproduzir, o Concord passa a transmissão para o H.264, que
                funciona em qualquer computador. Quando quem transmite desliga essa opção, você pode pedir o H.264 pelo botão que aparece na tela.
              </p>
            </Fix>
            <Fix title="Atualizar o driver resolve?">
              <p>Só se a sua placa tem o recurso. Placas anteriores ao H.265 (veja a tabela acima) não passam a reproduzir com um driver novo.</p>
            </Fix>
            <Fix title="E no celular?">
              <p>Depende do aparelho e do navegador. Faça o teste pelo próprio celular.</p>
            </Fix>
          </div>
        </section>

        {IS_WINDOWS && here !== 'app' && (
          <section className="cp-app">
            <div>
              <p className="cp-eyebrow">O caminho mais curto</p>
              <h2>Use o app do Concord</h2>
              <p>Ele já vem com tudo ligado para o H.265 e ainda transmite o áudio do jogo sem a voz da sala voltar. É de graça e de código aberto.</p>
              <div className="cp-row">
                <AppButton />
              </div>
            </div>
            <img className="cp-app-logo" src="/brand/concord-simbolo.svg" alt="" />
          </section>
        )}

        <footer className="cp-foot">
          <span>Concord · código aberto (MIT)</span>
          <span>
            <a href="/inicio/">Início</a> · <a href="/privacidade/">Privacidade</a> · <a href="/termos/">Termos</a>
          </span>
        </footer>
      </main>
    </div>
  );
}

/** A mesma cena com a mesma internet: em H.264 sai borrada e quadriculada, em H.265 sai nítida. */
function Compare() {
  const frame = (label: string, blocky: boolean) => (
    <div className={`cp-frame${blocky ? ' cp-blocky' : ''}`}>
      <div className="cp-frame-label">
        <b>{label}</b>
        <span>4 Mbps</span>
      </div>
      <div className="cp-stage">
        <div className="cp-scene" />
        <div className="cp-scene-text">
          <i style={{ width: 70 }} />
          <i style={{ width: 46 }} />
          <i style={{ width: 58 }} />
        </div>
        <span className="cp-scene-gg" style={blocky ? { filter: 'blur(1.6px)' } : undefined}>
          GG!
        </span>
      </div>
    </div>
  );
  return (
    <figure className="cp-compare" aria-label="A mesma cena com a mesma internet: em H.264 sai borrada, em H.265 sai nítida" style={{ margin: 0 }}>
      <span className="cp-tag cp-tag-1">mesma internet</span>
      {frame('H.264', true)}
      {frame('H.265', false)}
      <span className="cp-tag cp-tag-2">bem mais nítido</span>
    </figure>
  );
}

/** O que a sala do Concord detectou (veio pelo link do tutorial). */
function RoomNote({ cause, gpu, fromApp }: { cause: H265Cause; gpu: string | null; fromApp: boolean }) {
  const { title, body } = causeText(cause, gpu, fromApp);
  return (
    <div className="cp-note">
      <p className="cp-eyebrow">{fromApp ? 'O que o app detectou' : 'O que detectamos na sala'}</p>
      <h3>{title}</h3>
      <p>{body}</p>
      <p>
        O passo a passo está em <a href="#resolver">Como resolver</a>.
      </p>
    </div>
  );
}

function TestResult({ result }: { result: H265Diagnosis }) {
  const ok = result.cause === 'ok';
  const fixable = result.cause === 'hwaccel' || result.cause === 'driver' || result.cause === 'linux' || result.cause === 'firefox';
  const tone = ok ? 'ok' : fixable ? 'warn' : 'bad';
  const { title, body, steps } = causeText(result.cause, result.gpu.name);
  const Icon = ok ? CheckCircle2 : fixable ? AlertTriangle : XCircle;
  const appHelps = IS_WINDOWS && (result.cause === 'firefox' || result.cause === 'hwaccel');
  return (
    <div className={`cp-result ${tone}`}>
      <span className="cp-result-icon">
        <Icon size={28} />
      </span>
      <div>
        <h3>{ok ? 'Tudo certo! Você assiste em alta qualidade.' : fixable ? `Quase lá: ${title.charAt(0).toLowerCase()}${title.slice(1)}` : title}</h3>
        <p>{ok ? 'Seu navegador e sua placa de vídeo reproduzem H.265. Não precisa fazer nada.' : body}</p>
        {!ok && steps && (
          <ol className="cp-steps">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        {!ok && (appHelps || result.cause === 'driver' || result.cause === 'hwaccel') && (
          <div className="cp-row">
            {appHelps && <AppButton />}
            {(result.cause === 'driver' || result.cause === 'hwaccel') && <DriverButtons only={result.gpu.vendor} />}
          </div>
        )}
        <div className="cp-facts">
          <span className="cp-chip">
            Placa: <b>{result.gpu.name ?? (result.gpu.software ? 'nenhuma em uso' : 'o navegador não informa')}</b>
          </span>
          <span className="cp-chip">
            H.265 no navegador: <b>{result.decode ? 'sim' : 'não'}</b>
          </span>
        </div>
      </div>
    </div>
  );
}

function Steps({ cause }: { cause: H265Cause }) {
  const { body, steps } = causeText(cause, null);
  return (
    <>
      <p>{body}</p>
      {steps && (
        <ol className="cp-steps">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
    </>
  );
}

function AppButton() {
  return (
    <a className="cp-btn cp-btn-primary cp-btn-sm" href={APP_DOWNLOAD_URL}>
      <Download size={16} /> Baixar o app do Concord
    </a>
  );
}

function DriverButtons({ only }: { only?: string | null }) {
  if (only === 'apple') return <p className="cp-small">No Mac, o driver vem com o macOS: atualize o sistema em Ajustes do Sistema → Geral → Atualização de Software.</p>;
  const vendors = (Object.keys(DRIVER_LINKS) as (keyof typeof DRIVER_LINKS)[]).filter((v) => !only || v === only);
  return (
    <>
      {vendors.map((v) => (
        <a key={v} className="cp-btn cp-btn-ghost cp-btn-sm" href={DRIVER_LINKS[v].url} target="_blank" rel="noreferrer">
          <ExternalLink size={15} /> {DRIVER_LINKS[v].label}
        </a>
      ))}
    </>
  );
}

function GpuTable({ initial }: { initial: string }) {
  const [query, setQuery] = useState(initial);
  const verdict = query.trim().length >= 3 ? classifyGpu(query) : null;
  return (
    <section className="cp-section" id="placas">
      <div className="cp-section-head">
        <p className="cp-eyebrow">Placas de vídeo</p>
        <h2>Quais placas funcionam?</h2>
        <p className="cp-lede">Digite o modelo da sua placa, por exemplo "GTX 1060" ou "RX 580".</p>
      </div>
      <label className="cp-search">
        <Search size={20} color="var(--muted)" />
        <span className="sr-only">Modelo da placa de vídeo</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Modelo da placa" />
      </label>
      {verdict && (
        <p className={`cp-verdict ${verdict}`}>
          {verdict === 'yes' ? <CheckCircle2 size={20} /> : verdict === 'no' ? <XCircle size={20} /> : <HelpCircle size={20} />}
          {verdict === 'yes'
            ? 'Essa placa reproduz H.265. Se mesmo assim não funcionar, atualize o driver e o navegador.'
            : verdict === 'no'
              ? 'Essa placa é anterior ao H.265 e não reproduz esse formato. Você continua assistindo quando a transmissão está em H.264.'
              : 'Não reconhecemos esse modelo. Use o teste lá em cima: ele confere direto no seu computador.'}
        </p>
      )}
      <div className="cp-table">
        {GPU_TABLE.map((row) => (
          <div key={row.vendor} className="cp-table-row">
            <b>{row.vendor}</b>
            <p>
              <CheckCircle2 size={17} color="var(--mint)" />
              {row.yes}
            </p>
            <p>
              <XCircle size={17} color="var(--red)" />
              {row.no}
            </p>
          </div>
        ))}
      </div>
      <p className="cp-small">A tabela é um resumo. O teste é mais confiável, porque confere a placa, o driver e o navegador de verdade.</p>
    </section>
  );
}

function Fix({ title, icon, open, children }: { title: string; icon?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details open={open}>
      <summary>
        {icon && <span className="cp-acc-ico">{icon}</span>}
        {title}
        <ChevronDown size={20} className="cp-acc-chev" />
      </summary>
      <div className="cp-acc-body" style={icon ? undefined : { paddingLeft: 20 }}>
        {children}
      </div>
    </details>
  );
}
