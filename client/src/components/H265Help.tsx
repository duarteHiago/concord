// H.265 na sala de voz: o tutorial de quem não consegue assistir (transmissão em H.265 sem troca
// para H.264), o selo do codec e os pedidos de "liberar H.264" na tela de quem transmite.
import { Download, ExternalLink, MonitorX, RefreshCw, Send } from 'lucide-react';
import { desktop } from '../lib/desktop';
import { APP_DOWNLOAD_URL, DRIVER_LINKS, appHelps, causeText, compatibilityUrl, type H265Cause, type H265Diagnosis } from '../lib/h265';
import { useVoice } from '../store/voice';
import { Button, cx } from './ui';

const DRIVER_CAUSES: H265Cause[] = ['hwaccel', 'driver', 'ok'];

/** Sobre a tela de quem transmite, para quem não consegue assistir. */
export function H265Help({ identity, diagnosis, compact, onExpand }: { identity: string; diagnosis: H265Diagnosis; compact?: boolean; onExpand: () => void }) {
  const requestH264 = useVoice((s) => s.requestH264);
  const setWatching = useVoice((s) => s.setWatching);
  const { title, body, steps } = causeText(diagnosis.cause, diagnosis.gpu.name, !!desktop);
  const vendor = diagnosis.gpu.vendor;
  const driver = vendor && vendor !== 'apple' && DRIVER_CAUSES.includes(diagnosis.cause) ? DRIVER_LINKS[vendor] : null;
  const retry = () => {
    setWatching(identity, false);
    setTimeout(() => setWatching(identity, true), 300);
  };

  if (compact) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-2 p-4 text-center">
        <MonitorX size={28} className="text-warn" />
        <p className="text-sm font-bold">Não dá para reproduzir esta transmissão aqui</p>
        <Button variant="secondary" onClick={onExpand} className="h-8 px-3 text-xs">
          Ver como resolver
        </Button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-y-auto bg-surface-2" onClick={(e) => e.stopPropagation()}>
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-4 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-warn/15 text-warn">
            <MonitorX size={22} />
          </span>
          <div>
            <p className="text-xs font-bold tracking-wide text-fg-muted uppercase">Não foi possível reproduzir</p>
            <h3 className="text-lg font-bold">{title}</h3>
          </div>
        </div>
        <p className="text-sm text-fg-muted">{body}</p>
        {steps && (
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap gap-2">
          {appHelps(diagnosis.cause) && (
            <a href={APP_DOWNLOAD_URL} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-bold text-on-accent transition-colors hover:bg-accent-hover">
              <Download size={15} /> Baixar o app do Concord
            </a>
          )}
          {driver && (
            <a href={driver.url} target="_blank" rel="noreferrer" className={linkButton}>
              <ExternalLink size={15} /> {driver.label}
            </a>
          )}
          <a href={compatibilityUrl(diagnosis, !!desktop)} target="_blank" rel="noreferrer" className={linkButton}>
            <ExternalLink size={15} /> Ver se minha placa é compatível
          </a>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button onClick={() => requestH264(identity)}>
            <Send size={15} /> Pedir o formato padrão (H.264)
          </Button>
          <Button variant="ghost" onClick={retry}>
            <RefreshCw size={15} /> Tentar de novo
          </Button>
        </div>
      </div>
    </div>
  );
}

const linkButton = 'inline-flex h-9 items-center gap-1.5 rounded-xl bg-surface-3 px-3 text-sm font-semibold text-fg transition-colors hover:bg-surface-4';

/** Selo na minha própria tela: em que formato ela está saindo (só quando escolhi H.265). */
export function ShareCodecBadge() {
  const codec = useVoice((s) => s.shareCodec);
  if (codec !== 'h265' && codec !== 'h264-backup') return null;
  const backup = codec === 'h264-backup';
  return (
    <span
      title={
        backup
          ? 'Alguém na sala não consegue reproduzir H.265, então a transmissão está saindo em H.264 para todos. Ela volta para H.265 sozinha quando essa pessoa sair.'
          : 'Sua tela está saindo em H.265.'
      }
      className={cx('pointer-events-auto rounded-full px-2.5 py-1 text-xs font-bold backdrop-blur', backup ? 'bg-warn/20 text-warn' : 'bg-surface-1/80 text-fg')}
    >
      {backup ? 'H.264 · reserva' : 'H.265'}
    </span>
  );
}

/** Na minha própria tela: quem pediu para eu liberar o H.264. */
export function CodecRequests() {
  const requests = useVoice((s) => s.codecRequests);
  const fallbackToH264 = useVoice((s) => s.fallbackToH264);
  if (!requests.length) return null;
  const names = requests.map((r) => r.name);
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
  return (
    <div className="absolute inset-x-4 bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl bg-surface-1/95 p-3 shadow-xl backdrop-blur" onClick={(e) => e.stopPropagation()}>
      <p className="min-w-0 flex-1 text-sm">
        <b>{who}</b> não {names.length === 1 ? 'consegue' : 'conseguem'} reproduzir H.265 e {names.length === 1 ? 'pediu' : 'pediram'} o formato padrão.
      </p>
      <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => useVoice.setState({ codecRequests: [] })}>
        Agora não
      </Button>
      <Button className="h-8 px-3 text-xs" onClick={() => void fallbackToH264()}>
        Passar para H.264
      </Button>
    </div>
  );
}
