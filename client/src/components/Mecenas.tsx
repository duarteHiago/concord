// Aviso de que a pessoa virou Mecenas (ver server/src/mecenas.ts): aparece uma vez, logo depois do
// agradecimento do Pix (ou na próxima vez que ela abrir o app, se fechou antes).
import { Gem, MicOff, Pencil, PhoneOff, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { useApp } from '../store/app';
import { Button } from './ui';

export function MecenasModal() {
  const me = useApp((s) => s.me)!;
  const saveSettings = useApp((s) => s.saveSettings);
  const closeModal = useApp((s) => s.closeModal);
  const target = me.mecenasPowers?.target;

  const close = () => {
    void saveSettings({ mecenasSeen: true });
    closeModal();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!target) return null;
  const powers = [
    { icon: Zap, text: 'Tremer a tela dele quase sem esperar' },
    { icon: MicOff, text: 'Silenciar o microfone dele nas salas' },
    { icon: PhoneOff, text: 'Tirar ele da sala de voz' },
    { icon: Pencil, text: 'Trocar o apelido dele nos servidores' },
  ];

  return (
    <div role="dialog" aria-label="Você é o Mecenas" className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={close}>
      <div className="w-full max-w-[440px] animate-pop-in overflow-hidden rounded-[28px] bg-surface-2 shadow-2xl ring-1 ring-warn/40" onMouseDown={(e) => e.stopPropagation()}>
        <div className="relative flex flex-col items-center gap-3 bg-linear-to-b from-warn/20 to-transparent px-6 pt-8 pb-2 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-warn/20 text-warn ring-2 ring-warn/50">
            <Gem size={32} />
          </span>
          <span className="font-display text-[11px] font-extrabold tracking-[0.2em] text-warn uppercase">Cargo exclusivo</span>
          <h2 className="font-display text-2xl font-extrabold text-balance">Você agora é o Mecenas do Concord</h2>
          <p className="text-sm text-fg-muted">
            Esse cargo é só seu, ninguém mais tem. Ele aparece no seu perfil. E tem um bônus: com o <b className="text-fg">@{target.username}</b> você
            pode fazer o que bem entender.
          </p>
        </div>
        <ul className="mx-6 my-4 space-y-2 rounded-2xl bg-surface-0 p-4">
          {powers.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm">
              <Icon size={16} className="shrink-0 text-warn" />
              {text}
            </li>
          ))}
        </ul>
        <p className="px-6 text-xs text-fg-subtle">É só clicar no perfil do @{target.username} em qualquer servidor que vocês dois estão. Se ele entrar em "Não perturbe", a tela dele para de tremer.</p>
        <div className="flex justify-end px-6 py-5">
          <Button onClick={close}>Vou usar com sabedoria</Button>
        </div>
      </div>
    </div>
  );
}

/** Abre o aviso uma vez, quando o cargo chega (Pix confirmado) e não tem outra janela por cima (a do agradecimento fecha antes). */
export function useMecenasReveal() {
  const pending = useApp((s) => !!s.me?.mecenasPowers && !s.me.settings.mecenasSeen);
  const modal = useApp((s) => s.modal);
  useEffect(() => {
    if (!pending || modal) return;
    const t = setTimeout(() => useApp.getState().openModal({ type: 'mecenas' }), 400);
    return () => clearTimeout(t);
  }, [pending, modal]);
}
