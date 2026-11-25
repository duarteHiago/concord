// Convite para ligar as notificações no app instalado (tela de início), uma vez só: no mesmo vidro dos avisos do app.
// O pedido de permissão do sistema precisa vir de um toque (no iPhone é obrigatório), por isso o botão.
import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { enablePush, isStandalone, pushSupported } from '../lib/push';
import { toast } from '../store/toast';

const ASKED = 'concord.push.asked';

function alreadyAsked() {
  try {
    return localStorage.getItem(ASKED) === '1';
  } catch {
    return true;
  }
}
function markAsked() {
  try {
    localStorage.setItem(ASKED, '1');
  } catch {
    // sem armazenamento: o convite pode voltar na próxima vez, sem problema
  }
}

export function PushPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isStandalone || !pushSupported() || Notification.permission !== 'default' || alreadyAsked()) return;
    // espera o app assentar antes de perguntar
    const t = setTimeout(() => setShow(true), 4000);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  const close = () => {
    markAsked();
    setShow(false);
  };
  const enable = async () => {
    setBusy(true);
    try {
      const r = await enablePush();
      if (r === 'ok') toast.success('Pronto: você vai receber as notificações neste aparelho.');
      else if (r === 'denied') toast.info('Sem permissão. Dá para ligar depois em Ajustes → Notificações.');
    } catch (err) {
      toast.error(err);
    }
    close();
  };

  return (
    <div
      role="dialog"
      aria-label="Receber notificações"
      className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-[140] mx-auto max-w-sm animate-slide-up rounded-[22px] bg-surface-2/85 p-4 shadow-[0_10px_30px_rgb(15_27_61/0.2)] ring-1 ring-line backdrop-blur-2xl backdrop-saturate-150"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-on-accent">
          <Bell size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-extrabold">Receber notificações?</div>
          <p className="text-sm leading-snug text-fg-muted">Menções, mensagens diretas e respostas nas suas threads, mesmo com o Concord fechado.</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={close} className="h-10 rounded-full bg-surface-3 text-sm font-bold text-fg-muted active:bg-surface-4">
          Agora não
        </button>
        <button onClick={() => void enable()} disabled={busy} className="h-10 rounded-full bg-accent text-sm font-bold text-on-accent active:bg-accent-hover disabled:opacity-60">
          Ativar
        </button>
      </div>
    </div>
  );
}
