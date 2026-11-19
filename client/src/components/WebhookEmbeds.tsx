import { Clock, ExternalLink } from 'lucide-react';
import type { WebhookEmbed } from '../lib/types';
import { RichText } from './ChatView';
import { cx } from './ui';

const hex = (color?: number) => (color === undefined ? undefined : `#${color.toString(16).padStart(6, '0')}`);

/**
 * Cartões de uma mensagem de webhook (alerta, incidente, deploy...), no desenho dos outros cartões do chat
 * (clipe, jogo, Jam): canto de 22px, superfície 2, linha de origem em cima e título em Outfit. A cor que o app
 * manda (vermelho de alerta, verde de resolvido) vira a faixa arredondada à esquerda e a bolinha da origem;
 * sem cor, fica a de destaque do tema.
 */
export function WebhookEmbeds({ embeds }: { embeds: WebhookEmbed[] }) {
  return (
    <div className="mt-1 flex w-[min(460px,100%)] flex-col gap-2">
      {embeds.map((e, i) => {
        const color = hex(e.color);
        const inline = e.fields?.filter((f) => f.inline) ?? [];
        const block = e.fields?.filter((f) => !f.inline) ?? [];
        return (
          <div key={i} className="flex gap-3 rounded-[22px] bg-surface-2 p-4 ring-1 ring-line">
            <span aria-hidden className={cx('w-1 shrink-0 rounded-full', !color && 'bg-accent')} style={color ? { background: color } : undefined} />
            <div className="min-w-0 flex-1">
              {e.author && (
                <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-fg-muted">
                  <span aria-hidden className={cx('h-2 w-2 shrink-0 rounded-full', !color && 'bg-accent')} style={color ? { background: color } : undefined} />
                  <span className="truncate">{e.author}</span>
                </div>
              )}
              {e.title &&
                (e.url ? (
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="group inline-flex max-w-full items-baseline gap-1.5 font-display text-[17px] leading-snug font-bold text-fg hover:text-accent"
                  >
                    <span className="wrap-anywhere">{e.title}</span>
                    <ExternalLink size={13} className="shrink-0 self-center text-fg-subtle group-hover:text-accent" />
                  </a>
                ) : (
                  <div className="font-display text-[17px] leading-snug font-bold wrap-anywhere text-fg">{e.title}</div>
                ))}
              {e.description && (
                <div className="mt-1 text-[14px] leading-relaxed wrap-anywhere whitespace-pre-wrap text-fg-muted">
                  <RichText text={e.description} />
                </div>
              )}
              {inline.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {inline.map((f, j) => (
                    <Field key={j} name={f.name} value={f.value} />
                  ))}
                </div>
              )}
              {block.length > 0 && (
                <div className="mt-2 space-y-2">
                  {block.map((f, j) => (
                    <Field key={j} name={f.name} value={f.value} />
                  ))}
                </div>
              )}
              {(e.footer || e.timestamp) && (
                <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-fg-subtle">
                  {e.timestamp && <Clock size={11} className="shrink-0" />}
                  <span className="truncate">
                    {[e.footer, e.timestamp && new Date(e.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })].filter(Boolean).join(' · ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Um campo do cartão: rótulo pequeno em cima, valor embaixo, num bloco da superfície 3 (como o código do clipe). */
function Field({ name, value }: { name: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface-3 px-3 py-2">
      {name && <div className="truncate text-[11px] font-bold text-fg-subtle">{name}</div>}
      {value && (
        <div className="text-[14px] font-semibold wrap-anywhere whitespace-pre-wrap text-fg">
          <RichText text={value} />
        </div>
      )}
    </div>
  );
}
