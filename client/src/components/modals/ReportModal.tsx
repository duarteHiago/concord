import { Check, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { REPORT_CATEGORIES, REPORT_CATEGORY_INFO, type ReportCategory } from '../../../../shared/reports.ts';
import { api } from '../../lib/api';
import { captureFrames, hasVisibleVideo } from '../../lib/reportFrames';
import { useApp, type Modal as ModalState } from '../../store/app';
import { toast } from '../../store/toast';
import { Button, Modal, Spinner, cx } from '../ui';

export type ReportTarget = Extract<ModalState, { type: 'report' }>['target'];

/**
 * Denunciar uma mensagem, uma conta ou uma transmissão. Vai só para a equipe do Concord; quem foi denunciado não
 * fica sabendo. Quando a pessoa está com tela ou câmera aparecendo para você, a denúncia vira "da transmissão" e
 * leva algumas fotos do vídeo como prova (dá para desmarcar).
 */
export function ReportModal({ target }: { target: ReportTarget }) {
  const close = useApp((s) => s.closeModal);
  const isUser = target.kind === 'user';
  const [stream] = useState(() => isUser && hasVisibleVideo(target.userId));
  const [frames, setFrames] = useState<string[] | null>(stream ? null : []);
  const [sendFrames, setSendFrames] = useState(true);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (stream && isUser) void captureFrames(target.userId).then(setFrames);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title =
    target.kind === 'user' ? (stream ? `Denunciar a transmissão de ${target.name}` : `Denunciar ${target.name}`) : `Denunciar mensagem de ${target.authorName}`;

  async function send() {
    if (!category) return;
    setSending(true);
    try {
      const base = { category, details: details.trim() || undefined };
      if (target.kind === 'user') {
        await api.post('/reports', stream ? { ...base, kind: 'stream', userId: target.userId, frames: sendFrames ? frames ?? [] : [] } : { ...base, kind: 'user', userId: target.userId });
      } else {
        await api.post('/reports', { ...base, kind: target.kind, id: target.id });
      }
      toast.success('Denúncia enviada. Só a equipe do Concord vê, e quem foi denunciado não fica sabendo.');
      close();
    } catch (err) {
      toast.error(err);
      setSending(false);
    }
  }

  return (
    <Modal
      title={title}
      subtitle="Vai só para a equipe do Concord. Quem foi denunciado não fica sabendo quem denunciou."
      onClose={close}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="danger" loading={sending} disabled={!category || frames === null} onClick={() => void send()}>
            Enviar denúncia
          </Button>
        </>
      }
    >
      {stream && (
        <div className="mb-4 rounded-2xl bg-surface-3 p-3">
          <p className="mb-2 text-xs font-bold text-fg-muted">Imagens da tela agora</p>
          {frames === null ? (
            <div className="flex h-20 items-center justify-center gap-2 text-sm text-fg-muted">
              <Spinner size={18} /> Guardando o que está aparecendo…
            </div>
          ) : frames.length ? (
            <>
              <div className="flex gap-2">
                {frames.map((f, i) => (
                  <img key={i} src={f} alt={`Imagem ${i + 1} da transmissão`} className={cx('h-20 min-w-0 flex-1 rounded-lg object-cover', !sendFrames && 'opacity-30')} />
                ))}
              </div>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={sendFrames} onChange={(e) => setSendFrames(e.target.checked)} className="accent-[var(--color-accent)]" />
                Mandar essas imagens junto (ajudam a equipe a entender o que aconteceu)
              </label>
            </>
          ) : (
            <p className="text-sm text-fg-muted">Não deu para guardar imagens da tela. A denúncia vai mesmo assim.</p>
          )}
        </div>
      )}

      <p className="mb-2 text-xs font-bold text-fg-muted">O que aconteceu?</p>
      <div className="space-y-1.5" role="radiogroup">
        {REPORT_CATEGORIES.map((c) => {
          const info = REPORT_CATEGORY_INFO[c];
          const on = category === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setCategory(c)}
              className={cx('flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left ring-1 transition-colors', on ? 'bg-danger/10 ring-danger' : 'bg-surface-3 ring-transparent hover:ring-line-strong')}
            >
              <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-2', on ? 'bg-danger ring-danger' : 'ring-fg-subtle')}>
                {on && <Check size={11} className="text-white" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{info.label}</span>
                <span className="block text-xs text-fg-muted">{info.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      {(category === 'csam' || category === 'violence') && (
        <div className="mt-3 flex gap-2 rounded-2xl bg-warn/10 p-3 text-xs text-fg">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warn" />
          <span>
            {category === 'csam'
              ? 'Se uma criança corre perigo agora, ligue 190. Também dá para denunciar na SaferNet (denuncie.org.br), que encaminha às autoridades.'
              : 'Se alguém corre perigo agora, ligue 190. Se alguém fala em se machucar, o CVV atende de graça, 24 horas, no 188.'}
          </span>
        </div>
      )}

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-bold text-fg-muted">Detalhes (opcional)</span>
        <textarea
          value={details}
          maxLength={1000}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          placeholder="O que a equipe precisa saber?"
          className="w-full resize-none rounded-2xl border border-transparent bg-surface-3 px-4 py-3 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
        />
      </label>
    </Modal>
  );
}
