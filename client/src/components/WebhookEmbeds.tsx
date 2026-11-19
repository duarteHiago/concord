import type { WebhookEmbed } from '../lib/types';
import { RichText } from './ChatView';
import { cx } from './ui';

const hex = (color?: number) => (color === undefined ? undefined : `#${color.toString(16).padStart(6, '0')}`);

/** Cartões de uma mensagem de webhook (alerta, incidente...): faixa colorida, título, texto, campos e rodapé. */
export function WebhookEmbeds({ embeds }: { embeds: WebhookEmbed[] }) {
  return (
    <div className="mt-1 flex w-full max-w-[520px] flex-col gap-1.5">
      {embeds.map((e, i) => (
        <div
          key={i}
          className="rounded-xl border-l-4 border-line bg-surface-2 px-3.5 py-2.5 text-sm ring-1 ring-line"
          style={e.color !== undefined ? { borderLeftColor: hex(e.color) } : undefined}
        >
          {e.author && <div className="mb-0.5 text-xs font-semibold text-fg-muted">{e.author}</div>}
          {e.title &&
            (e.url ? (
              <a href={e.url} target="_blank" rel="noreferrer noopener" className="block font-bold text-accent hover:underline">
                {e.title}
              </a>
            ) : (
              <div className="font-bold text-fg">{e.title}</div>
            ))}
          {e.description && (
            <div className="mt-1 leading-relaxed wrap-anywhere whitespace-pre-wrap text-fg">
              <RichText text={e.description} />
            </div>
          )}
          {e.fields && (
            <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3">
              {e.fields.map((f, j) => (
                <div key={j} className={cx('min-w-0', !f.inline && 'sm:col-span-3')}>
                  {f.name && <div className="text-xs font-bold text-fg-muted">{f.name}</div>}
                  {f.value && (
                    <div className="wrap-anywhere whitespace-pre-wrap text-fg">
                      <RichText text={f.value} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {(e.footer || e.timestamp) && (
            <div className="mt-2 text-[11px] text-fg-subtle">
              {[e.footer, e.timestamp && new Date(e.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
