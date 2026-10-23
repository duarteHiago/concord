// Página pública /compatibilidade: "meu computador consegue assistir transmissões em H.265?".
// Sem login. Escrita para quem não é da área: primeiro a resposta, depois como resolver, por último
// a tabela de placas. Quando vem do tutorial da sala, chega com a placa e o motivo já detectados.
import { CheckCircle2, ChevronDown, ExternalLink, HelpCircle, Search, XCircle, AlertTriangle } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { DRIVER_LINKS, GPU_TABLE, causeText, classifyGpu, diagnoseH265, type H265Cause, type H265Diagnosis } from '../lib/h265';
import { cx } from './ui';

const CAUSES: H265Cause[] = ['ok', 'firefox', 'hwaccel', 'old-gpu', 'linux', 'driver'];

function readParams() {
  const q = new URLSearchParams(location.search);
  const motivo = q.get('motivo') as H265Cause | null;
  return { gpu: q.get('gpu') ?? '', cause: motivo && CAUSES.includes(motivo) ? motivo : null, fromApp: q.get('app') === '1' };
}

export default function CompatibilityPage() {
  const params = useMemo(readParams, []);
  const [result, setResult] = useState<H265Diagnosis | null>(null);

  return (
    <div className="h-full overflow-y-auto bg-surface-0 text-fg">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 pt-6 sm:px-6">
        <a href="/inicio/">
          <img src="/brand/concord-logo.png" alt="Concord" width={140} height={32} />
        </a>
        <a href="/" className="text-sm font-semibold text-fg-muted hover:text-fg">
          Abrir o Concord
        </a>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <p className="mt-10 text-xs font-bold tracking-wide text-accent uppercase">Compatibilidade</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Seu computador consegue assistir transmissões em alta qualidade?</h1>
        <p className="mt-3 text-lg text-fg-muted">
          Algumas transmissões no Concord usam o <b className="text-fg">H.265</b>, um formato de vídeo que mostra a tela mais nítida usando menos internet. Para
          reproduzi-lo, o computador precisa de uma placa de vídeo que entenda esse formato. Descubra em um clique se a sua entende.
        </p>

        {params.cause && <AppResult cause={params.cause} gpu={params.gpu || null} fromApp={params.fromApp} />}

        <section className="mt-8 rounded-[28px] bg-surface-2 p-5 sm:p-7">
          <h2 className="text-xl font-bold">{params.cause ? 'Testar este navegador' : 'Teste rápido'}</h2>
          <p className="mt-1 text-sm text-fg-muted">
            {params.fromApp
              ? 'Você abriu esta página pelo app do Concord, então ela abriu no seu navegador. O resultado abaixo vale para este navegador, não para o app.'
              : 'Não instala nada e não envia nada: o teste roda aqui mesmo, no seu navegador.'}
          </p>
          <button
            onClick={() => setResult(diagnoseH265())}
            className="mt-4 h-12 w-full rounded-2xl bg-accent px-6 text-base font-bold text-on-accent transition-colors hover:bg-accent-hover sm:w-auto"
          >
            {result ? 'Testar de novo' : 'Testar meu computador'}
          </button>
          {result && <TestResult result={result} />}
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold">Como resolver</h2>
          <p className="mt-1 text-fg-muted">Abra o item que corresponde ao seu caso. Se não souber qual é, faça o teste acima: ele aponta o motivo.</p>
          <div className="mt-4 space-y-2">
            <Fix title="Uso o Firefox" open={params.cause === 'firefox'}>
              <Steps cause="firefox" />
            </Fix>
            <Fix title="A aceleração por hardware está desligada" open={params.cause === 'hwaccel'}>
              <Steps cause="hwaccel" />
              <DriverButtons />
            </Fix>
            <Fix title="Minha placa deveria funcionar, mas não funciona" open={params.cause === 'driver'}>
              <Steps cause="driver" />
              <DriverButtons />
              <p className="mt-3 text-sm text-fg-muted">
                Não sabe qual é a sua placa? No Windows, aperte <Kbd>Ctrl</Kbd> + <Kbd>Shift</Kbd> + <Kbd>Esc</Kbd>, vá em <b>Desempenho</b> e clique em{' '}
                <b>GPU</b>: o nome aparece no canto superior direito.
              </p>
            </Fix>
            <Fix title="Uso Linux" open={params.cause === 'linux'}>
              <p className="text-sm text-fg-muted">
                O Chrome e o Edge para Linux costumam vir com a reprodução de vídeo pela placa desligada. Instale o driver da sua placa (no Ubuntu, pelo aplicativo
                "Drivers adicionais") e abra o Chrome com a aceleração de vídeo ligada:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-surface-0 p-3 text-xs">google-chrome --enable-features=VaapiVideoDecoder,VaapiIgnoreDriverChecks</pre>
              <p className="mt-3 text-sm text-fg-muted">
                Para conferir, abra <code className="rounded bg-surface-0 px-1">chrome://gpu</code> e procure "Video Decode: Hardware accelerated". Se não aparecer,
                peça para quem transmite usar o H.264.
              </p>
            </Fix>
            <Fix title="Minha placa é antiga" open={params.cause === 'old-gpu'}>
              <Steps cause="old-gpu" />
              <p className="mt-3 text-sm text-fg-muted">
                Não precisa trocar de computador para usar o Concord: quem transmite pode deixar a opção "Voltar para H.264" ligada, e você assiste normalmente.
              </p>
            </Fix>
          </div>
        </section>

        <GpuTable initial={params.gpu} />

        <section className="mt-12">
          <h2 className="text-2xl font-bold">Perguntas frequentes</h2>
          <div className="mt-4 space-y-2">
            <Fix title="Por que meu amigo consegue assistir e eu não?">
              <p className="text-sm text-fg-muted">
                Quem reproduz o H.265 é a placa de vídeo, não a internet. Se a placa do seu amigo é mais nova, ou o navegador dele está com a aceleração ligada,
                ele consegue e você não, mesmo na mesma sala.
              </p>
            </Fix>
            <Fix title="Preciso comprar outra placa de vídeo?">
              <p className="text-sm text-fg-muted">
                Não. O H.265 é opcional. Na maioria das transmissões, se alguém não consegue reproduzir, o Concord passa a transmissão para o H.264, que
                funciona em qualquer computador. Quando quem transmite desliga essa opção, você pode pedir o H.264 pelo botão que aparece na tela.
              </p>
            </Fix>
            <Fix title="Atualizar o driver resolve?">
              <p className="text-sm text-fg-muted">
                Só se a sua placa tem o recurso. Placas anteriores ao H.265 (veja a tabela acima) não passam a reproduzir com um driver novo.
              </p>
            </Fix>
            <Fix title="E no celular?">
              <p className="text-sm text-fg-muted">Depende do aparelho e do navegador. Faça o teste acima pelo próprio celular.</p>
            </Fix>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-4 py-6 text-center text-sm text-fg-subtle">
        Concord · <a href="/inicio/" className="hover:text-fg">Início</a> · <a href="/privacidade/" className="hover:text-fg">Privacidade</a> ·{' '}
        <a href="/termos/" className="hover:text-fg">Termos</a>
      </footer>
    </div>
  );
}

/** O que a sala do Concord detectou (veio pelo link do tutorial). */
function AppResult({ cause, gpu, fromApp }: { cause: H265Cause; gpu: string | null; fromApp: boolean }) {
  const { title, body } = causeText(cause, gpu);
  return (
    <div className="mt-8 rounded-[28px] bg-warn/10 p-5 ring-1 ring-warn/30 sm:p-7">
      <p className="text-xs font-bold tracking-wide text-warn uppercase">{fromApp ? 'O que o app detectou' : 'O que detectamos na sala'}</p>
      <h2 className="mt-1 text-xl font-bold">{title}</h2>
      <p className="mt-2 text-fg-muted">{body}</p>
      <p className="mt-2 text-sm text-fg-subtle">O passo a passo está em "Como resolver", logo abaixo.</p>
    </div>
  );
}

function TestResult({ result }: { result: H265Diagnosis }) {
  const ok = result.cause === 'ok';
  const fixable = result.cause === 'hwaccel' || result.cause === 'driver' || result.cause === 'linux' || result.cause === 'firefox';
  const { title, body, steps } = causeText(result.cause, result.gpu.name);
  const Icon = ok ? CheckCircle2 : fixable ? AlertTriangle : XCircle;
  return (
    <div className={cx('mt-5 rounded-2xl p-4 sm:p-5', ok ? 'bg-ok/10 ring-1 ring-ok/30' : fixable ? 'bg-warn/10 ring-1 ring-warn/30' : 'bg-danger/10 ring-1 ring-danger/30')}>
      <div className="flex items-start gap-3">
        <Icon size={28} className={cx('shrink-0', ok ? 'text-ok' : fixable ? 'text-warn' : 'text-danger')} />
        <div className="min-w-0">
          <h3 className="text-lg font-bold">{ok ? 'Tudo certo! Você consegue assistir em alta qualidade.' : fixable ? `Quase lá: ${title.charAt(0).toLowerCase()}${title.slice(1)}` : title}</h3>
          {!ok && <p className="mt-1 text-sm text-fg-muted">{body}</p>}
          {!ok && steps && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              {steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-xs text-fg-subtle">
            Placa de vídeo: <b>{result.gpu.name ?? (result.gpu.software ? 'nenhuma em uso (aceleração desligada)' : 'o navegador não informa')}</b> · Navegador
            reproduz H.265: <b>{result.decode ? 'sim' : 'não'}</b>
          </p>
          {!ok && (result.cause === 'driver' || result.cause === 'hwaccel') && <DriverButtons only={result.gpu.vendor} />}
        </div>
      </div>
    </div>
  );
}

function Steps({ cause }: { cause: H265Cause }) {
  const { body, steps } = causeText(cause, null);
  return (
    <>
      <p className="text-sm text-fg-muted">{body}</p>
      {steps && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
    </>
  );
}

function DriverButtons({ only }: { only?: string | null }) {
  const vendors = (Object.keys(DRIVER_LINKS) as (keyof typeof DRIVER_LINKS)[]).filter((v) => !only || only === 'apple' || v === only);
  if (only === 'apple') return <p className="mt-3 text-sm text-fg-muted">No Mac, o driver vem junto com o macOS: atualize o sistema em Ajustes do Sistema → Geral → Atualização de Software.</p>;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {vendors.map((v) => (
        <a
          key={v}
          href={DRIVER_LINKS[v].url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-surface-3 px-3 text-sm font-semibold transition-colors hover:bg-surface-4"
        >
          <ExternalLink size={14} /> {DRIVER_LINKS[v].label}
        </a>
      ))}
    </div>
  );
}

function GpuTable({ initial }: { initial: string }) {
  const [query, setQuery] = useState(initial);
  const verdict = query.trim().length >= 3 ? classifyGpu(query) : null;
  return (
    <section className="mt-12">
      <h2 className="text-2xl font-bold">Quais placas de vídeo funcionam?</h2>
      <p className="mt-1 text-fg-muted">Digite o modelo da sua placa (por exemplo, "GTX 1060" ou "Radeon RX 580").</p>
      <label className="mt-4 flex h-12 items-center gap-2 rounded-2xl bg-surface-2 px-4 ring-1 ring-line focus-within:ring-accent">
        <Search size={18} className="shrink-0 text-fg-subtle" />
        <span className="sr-only">Modelo da placa de vídeo</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Modelo da placa" className="min-w-0 flex-1 bg-transparent outline-none" />
      </label>
      {verdict && (
        <p
          className={cx(
            'mt-3 flex items-start gap-2 rounded-xl p-3 text-sm',
            verdict === 'yes' ? 'bg-ok/10 text-ok' : verdict === 'no' ? 'bg-danger/10 text-red-300' : 'bg-surface-2 text-fg-muted',
          )}
        >
          {verdict === 'yes' ? <CheckCircle2 size={18} className="shrink-0" /> : verdict === 'no' ? <XCircle size={18} className="shrink-0" /> : <HelpCircle size={18} className="shrink-0" />}
          {verdict === 'yes'
            ? 'Essa placa reproduz H.265. Se mesmo assim não funcionar, atualize o driver e o navegador.'
            : verdict === 'no'
              ? 'Essa placa é anterior ao H.265 e não reproduz esse formato. Você continua assistindo quando a transmissão está em H.264.'
              : 'Não reconhecemos esse modelo. Use o teste rápido no topo da página: ele confere direto no seu computador.'}
        </p>
      )}
      <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-line">
        {GPU_TABLE.map((row, i) => (
          <div key={row.vendor} className={cx('grid gap-3 p-4 sm:grid-cols-[110px_1fr_1fr]', i % 2 ? 'bg-surface-1' : 'bg-surface-2')}>
            <b>{row.vendor}</b>
            <p className="flex items-start gap-2 text-sm">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" />
              {row.yes}
            </p>
            <p className="flex items-start gap-2 text-sm text-fg-muted">
              <XCircle size={16} className="mt-0.5 shrink-0 text-danger" />
              {row.no}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-fg-subtle">A tabela é um resumo. O teste rápido é mais confiável, porque confere a placa, o driver e o navegador de verdade.</p>
    </section>
  );
}

function Fix({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rounded-2xl bg-surface-2 ring-1 ring-line open:ring-line-strong">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold">
        {title}
        <ChevronDown size={18} className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md bg-surface-0 px-1.5 py-0.5 text-xs font-bold ring-1 ring-line">{children}</kbd>;
}
