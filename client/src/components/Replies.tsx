// Responder a uma mensagem (canais e DMs): a citação em cima da resposta, a faixa "Respondendo a…" em
// cima do campo de texto e o pulo até a mensagem original.
import { CornerUpLeft, X } from 'lucide-react';
import { useEffect } from 'react';
import type { Message, ReplyPreview } from '../lib/types';
import { useApp } from '../store/app';
import { toast } from '../store/toast';

/** Texto curto da mensagem respondida (jogo, figurinha e anexo não têm texto para mostrar). */
export function replySnippet(r: { content: string; kind?: string; hasAttachments?: boolean }) {
  if (r.kind === 'game') return '🎲 Jogo';
  if (r.kind === 'sticker') return '🖼️ Figurinha';
  if (r.kind === 'clip') return '🎬 Clipe';
  const text = r.content.replace(/\s+/g, ' ').trim();
  if (text) return text;
  return r.hasAttachments ? '📎 Anexo' : '';
}

/** Rola até a mensagem original e pisca o fundo dela. Se ainda não carregou (é antiga), avisa. */
export function jumpToMessage(id: string) {
  const el = document.getElementById(`msg-${id}`);
  if (!el) return toast.info('A mensagem original é mais antiga. Role a conversa para cima para carregá-la.');
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('bg-accent/10');
  setTimeout(() => el.classList.remove('bg-accent/10'), 1600);
}

/** Citação em cima da resposta. `nameOf` resolve o nome (apelido no servidor, "Você"...). */
export function ReplyQuote({ reply, nameOf }: { reply: ReplyPreview; nameOf: (authorId: string, fallback: string) => string }) {
  if (reply.deleted) {
    return (
      <div className="mb-1 flex items-center gap-1.5 px-1 text-xs text-fg-subtle italic">
        <CornerUpLeft size={12} className="shrink-0" /> Mensagem apagada
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => jumpToMessage(reply.id)}
      className="mb-1 flex max-w-full min-w-0 items-center gap-1.5 px-1 text-left text-xs text-fg-muted hover:text-fg"
      title="Ir para a mensagem original"
    >
      <CornerUpLeft size={12} className="shrink-0" />
      <b className="shrink-0">{nameOf(reply.authorId, reply.authorName)}</b>
      <span className="truncate">{replySnippet(reply)}</span>
    </button>
  );
}

/** Faixa em cima do campo de texto enquanto a pessoa escolhe o que responder. */
export function ReplyBar({ conversationId, name }: { conversationId: string; name: (m: Message) => string }) {
  const message = useApp((s) => s.replying[conversationId]);
  const active = !!message;

  // Esc cancela de qualquer lugar da conversa, menos quando ele já serve para outra coisa: fechar um modal,
  // fechar a lista de sugestões do campo (que marca o evento) ou cancelar a edição de uma mensagem
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || useApp.getState().modal) return;
      const t = e.target as HTMLElement | null;
      const editing = t?.tagName === 'TEXTAREA' && !/^(composer-|dm-composer)/.test(t.id);
      if (!editing) useApp.getState().setReplying(conversationId, null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, conversationId]);

  if (!message) return null;
  return (
    <div className="mb-2 flex animate-fade-in items-center gap-2 rounded-2xl bg-surface-2 px-4 py-2 text-sm ring-1 ring-line">
      <CornerUpLeft size={14} className="shrink-0 text-accent" />
      <span className="shrink-0 text-fg-muted">
        Respondendo a <b className="text-fg">{name(message)}</b>
      </span>
      <span className="min-w-0 flex-1 truncate text-fg-subtle">{replySnippet({ ...message, hasAttachments: !!message.attachments?.length })}</span>
      <button
        type="button"
        aria-label="Cancelar resposta"
        title="Cancelar (Esc)"
        onClick={() => useApp.getState().setReplying(conversationId, null)}
        className="shrink-0 rounded-full p-1 text-fg-subtle hover:bg-surface-4 hover:text-fg"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/** Começa a responder: guarda a mensagem e põe o cursor no campo de texto da conversa. */
export function startReply(conversationId: string, message: Message, composerId: string) {
  useApp.getState().setReplying(conversationId, message);
  requestAnimationFrame(() => document.getElementById(composerId)?.focus());
}
