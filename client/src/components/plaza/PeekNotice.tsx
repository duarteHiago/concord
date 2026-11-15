// Aviso para quem está numa call: alguém está espiando a mesa pela Praça (ouvindo por alguns segundos e podendo
// cochichar baixinho). Aparece em qualquer tela do app, não só na Praça.
import { useEffect, useState } from 'react';
import { memberName } from '../../lib/types';
import { useApp } from '../../store/app';
import { usePlaza } from '../../store/plaza';
import { useVoice } from '../../store/voice';

export function PeekNotice() {
  const serverId = useVoice((s) => (s.status !== 'idle' ? s.serverId : null));
  const channelId = useVoice((s) => (s.status !== 'idle' ? s.channelId : null));
  const peeks = usePlaza((s) => (serverId ? s.peeks[serverId] : undefined));
  const members = useApp((s) => (serverId ? s.details[serverId]?.members : undefined));
  const [now, setNow] = useState(() => Date.now());
  const active = (peeks ?? []).filter((p) => p.channelId === channelId && p.until > now);
  const has = active.length > 0;
  useEffect(() => {
    if (!has) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [has]);
  if (!has) return null;
  const name = (id: string) => {
    const m = members?.find((x) => x.id === id);
    return m ? memberName(m) : 'Alguém';
  };
  const spying = active.filter((p) => !p.near).map((p) => name(p.userId));
  const near = active.filter((p) => p.near).map((p) => name(p.userId));
  const line = (names: string[], verb: string) => `${names.join(', ')} ${names.length === 1 ? 'está' : 'estão'} ${verb}`;
  return (
    <div role="status" className="pointer-events-none fixed top-14 left-1/2 z-[90] flex -translate-x-1/2 animate-pop-in flex-col items-center gap-1">
      {spying.length > 0 && (
        <div className="rounded-full bg-[#1b1430] px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-xl ring-1 ring-white/20">
          👀 {line(spying, 'espiando a sua mesa')} <span className="font-normal text-white/60">· cochichos chegam baixinho</span>
        </div>
      )}
      {near.length > 0 && (
        <div className="rounded-full bg-[#1b1430]/90 px-3 py-1 text-[12px] font-semibold text-white shadow-lg ring-1 ring-white/15">
          👂 {line(near, 'ouvindo de perto pela Praça')}
        </div>
      )}
    </div>
  );
}
