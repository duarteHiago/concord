// Notificações de um servidor ou canal: o nível (todas as mensagens, só menções, nada) e silenciar por um tempo.
import { Bell, BellOff } from 'lucide-react';
import { useApp } from '../../store/app';
import { toast } from '../../store/toast';
import { effectiveLevel, MUTED_FOREVER, useUnreads } from '../../store/unreads';
import type { NotifyLevel } from '../../lib/types';
import { Button, Modal, cx } from '../ui';

const LEVEL_INFO: Record<NotifyLevel, { label: string; hint: string }> = {
  all: { label: 'Todas as mensagens', hint: 'Som e aviso a cada mensagem nova.' },
  mentions: { label: 'Só menções', hint: 'Avisa quando alguém escrever @você, @todos ou responder você.' },
  none: { label: 'Nada', hint: 'Sem som nem aviso. A bolinha e o contador continuam na lista.' },
};

const MUTE_OPTIONS: [string, number][] = [
  ['15 minutos', 15 * 60_000],
  ['1 hora', 60 * 60_000],
  ['8 horas', 8 * 60 * 60_000],
  ['24 horas', 24 * 60 * 60_000],
  ['Até eu reativar', Infinity],
];

export function NotifyLevelModal({ serverId, channelId }: { serverId: string; channelId?: string }) {
  const close = useApp((s) => s.closeModal);
  const server = useApp((s) => s.servers.find((x) => x.id === serverId));
  const channel = useApp((s) => (channelId ? s.details[serverId]?.channels.find((c) => c.id === channelId) : undefined));
  const levels = useUnreads((s) => s.levels);
  const setLevel = useUnreads((s) => s.setLevel);
  const targetId = channelId ?? serverId;
  const own = levels[targetId] ?? { level: null, mutedUntil: null };
  const serverDefault = effectiveLevel(levels, serverId).level;
  const mutedUntil = own.mutedUntil && own.mutedUntil > Date.now() ? own.mutedUntil : null;
  const name = channelId ? `#${channel?.name ?? 'canal'}` : (server?.name ?? 'servidor');

  const save = (patch: Partial<typeof own>) => void setLevel(targetId, { ...own, mutedUntil, ...patch }).catch(toast.error);

  const option = (value: NotifyLevel | null, label: string, hint: string) => {
    const selected = own.level === value;
    return (
      <button
        key={String(value)}
        onClick={() => save({ level: value })}
        aria-pressed={selected}
        className={cx(
          'flex w-full items-start gap-3 rounded-2xl border-2 p-3 text-left transition-colors',
          selected ? 'border-accent bg-accent/10' : 'border-transparent bg-surface-0 hover:bg-surface-3',
        )}
      >
        <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2', selected ? 'border-accent' : 'border-line-strong')}>
          {selected && <span className="h-2 w-2 rounded-full bg-accent" />}
        </span>
        <span>
          <span className="block text-sm font-bold">{label}</span>
          <span className="block text-xs text-fg-muted">{hint}</span>
        </span>
      </button>
    );
  };

  return (
    <Modal title={<span className="flex items-center gap-2"><Bell size={20} /> Notificações de {name}</span>} onClose={close}>
      <div className="space-y-5">
        <div className="space-y-2">
          {channelId
            ? option(null, `Igual ao servidor (${LEVEL_INFO[serverDefault].label.toLowerCase()})`, 'Segue o que você escolheu para o servidor.')
            : null}
          {(['all', 'mentions', 'none'] as const).map((lvl) =>
            option(
              // no servidor, "só menções" é o padrão: escolher ele é o mesmo que não ter escolhido nada
              !channelId && lvl === 'mentions' && own.level === null ? null : lvl,
              LEVEL_INFO[lvl].label + (!channelId && lvl === 'mentions' ? ' (padrão)' : ''),
              LEVEL_INFO[lvl].hint,
            ),
          )}
        </div>

        <div>
          <div className="mb-2 text-xs font-bold tracking-wide text-fg-muted uppercase">Silenciar</div>
          {mutedUntil ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-0 p-3">
              <span className="flex items-center gap-2 text-sm">
                <BellOff size={16} className="text-fg-muted" />
                {mutedUntil >= MUTED_FOREVER
                  ? 'Silenciado até você reativar'
                  : `Silenciado até ${new Date(mutedUntil).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`}
              </span>
              <Button variant="secondary" className="h-8 px-3 text-xs" onClick={() => save({ mutedUntil: null })}>
                Reativar
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {MUTE_OPTIONS.map(([label, ms]) => (
                <Button
                  key={label}
                  variant="secondary"
                  className="h-9 px-3 text-sm"
                  onClick={() => save({ mutedUntil: ms === Infinity ? MUTED_FOREVER : Date.now() + ms })}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-fg-muted">Silenciado, nada toca nem aparece, nem menção. O contador continua na lista.</p>
        </div>
      </div>
    </Modal>
  );
}
