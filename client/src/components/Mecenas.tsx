// Aviso de que a pessoa virou Mecenas num contrato (ver server/src/contracts.ts e Mecenato.tsx): aparece uma
// vez, na primeira vez que ela assume (ou depois do agradecimento do Pix, se foi o Pix que virou a liderança).
import { Gem, ImagePlus, MicOff, Pencil, PhoneOff, VolumeX, Wand2 } from 'lucide-react';
import { useEffect } from 'react';
import { useApp } from '../store/app';
import { Button } from './ui';

export function MecenasModal() {
  const me = useApp((s) => s.me)!;
  const saveSettings = useApp((s) => s.saveSettings);
  const closeModal = useApp((s) => s.closeModal);
  const openModal = useApp((s) => s.openModal);
  const target = me.mecenasPowers?.target;

  const close = () => {
    void saveSettings({ mecenasSeen: true });
    closeModal();
  };
  const openPranks = () => {
    void saveSettings({ mecenasSeen: true });
    openModal({ type: 'pranks' });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!target) return null;
  const powers = [
    { icon: MicOff, text: 'Silenciar o microfone nas salas' },
    { icon: VolumeX, text: 'Ensurdecer (não ouve ninguém)' },
    { icon: PhoneOff, text: 'Tirar da sala de voz' },
    { icon: Pencil, text: 'Trocar o apelido nos servidores' },
    { icon: ImagePlus, text: 'Trocar a foto/GIF do perfil até o fim do contrato' },
    { icon: Wand2, text: 'Soltar um efeito de voz surpresa' },
  ];

  return (
    <div role="dialog" aria-label="Você é o Mecenas" className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={close}>
      <div className="w-full max-w-[440px] animate-pop-in overflow-hidden rounded-[28px] bg-surface-2 shadow-2xl ring-1 ring-warn/40" onMouseDown={(e) => e.stopPropagation()}>
        <div className="relative flex flex-col items-center gap-3 bg-linear-to-b from-warn/20 to-transparent px-6 pt-8 pb-2 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-warn/20 text-warn ring-2 ring-warn/50">
            <Gem size={32} />
          </span>
          <span className="font-display text-[11px] font-extrabold tracking-[0.2em] text-warn uppercase">Contrato de Mecenato</span>
          <h2 className="font-display text-2xl font-extrabold text-balance">Você agora é o Mecenas</h2>
          <p className="text-sm text-fg-muted">
            O cargo aparece no seu perfil enquanto você tiver apoiado mais que <b className="text-fg">@{target.username}</b> neste contrato. E enquanto isso, você pode:
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
        <p className="px-6 text-xs text-fg-subtle">
          Tudo fica em Configurações → Mecenato → Sacanagens e Peripécias. Se @{target.username} ligar o Escudo, nada disso funciona até ele desligar (ou o saldo acabar).
        </p>
        <div className="flex justify-end gap-2 px-6 py-5">
          <Button variant="ghost" onClick={close}>
            Depois
          </Button>
          <Button onClick={openPranks}>Vou usar com sabedoria</Button>
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
