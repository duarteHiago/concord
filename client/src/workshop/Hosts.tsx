// O que a Oficina desenha por cima do app: intro, anunciador da sala, avisos de menção e o editor.
import { AtSign } from 'lucide-react';
import { useEffect } from 'react';
import { useApp } from '../store/app';
import { Avatar } from '../components/ui';
import { Emblem, packVars } from './Art';
import { useOverlays } from './runtime';
import { Studio } from './Studio';
import { WORKSHOP_ENABLED, useWorkshop } from './store';

function Intro() {
  const intro = useOverlays((s) => s.intro);
  useEffect(() => {
    if (!intro) return;
    const done = () => useOverlays.setState((s) => (s.intro?.key === intro.key ? { intro: null } : s));
    const t = setTimeout(done, 3000);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [intro]);
  if (!intro) return null;
  const { pack } = intro;
  return (
    <div
      key={intro.key}
      className="ws-intro ws-vars"
      style={packVars(pack)}
      onClick={() => useOverlays.setState({ intro: null })}
      role="status"
      aria-label={`${pack.intro.kicker}: ${intro.name}`}
    >
      <div className="ws-intro-emblem">
        <Emblem pack={pack} size={170} />
      </div>
      <div className="ws-intro-kicker">{pack.intro.kicker}</div>
      <div className="ws-intro-name" style={{ fontFamily: pack.font }}>
        {intro.name}
      </div>
      <div className="ws-intro-line">{pack.intro.line}</div>
      <div className="ws-intro-bar">
        <span />
      </div>
      <div className="mt-3 text-[11px] opacity-50">clique para pular</div>
    </div>
  );
}

function Announcer() {
  const a = useOverlays((s) => s.announce);
  useEffect(() => {
    if (!a) return;
    const t = setTimeout(() => useOverlays.setState((s) => (s.announce?.key === a.key ? { announce: null } : s)), 2900);
    return () => clearTimeout(t);
  }, [a]);
  if (!a) return null;
  return (
    <div key={a.key} className="ws-announce ws-vars" style={packVars(a.pack)} role="status">
      <div className="ws-announce-ribbon" style={{ fontFamily: a.pack.font }}>
        {a.text}
      </div>
    </div>
  );
}

function Mentions() {
  const cards = useOverlays((s) => s.mentions);
  if (!cards.length) return null;
  return (
    <div className="pointer-events-none fixed right-5 bottom-24 z-[65] flex w-80 max-w-[calc(100vw-2.5rem)] flex-col gap-2">
      {cards.map((c) => (
        <button
          key={c.id}
          type="button"
          className="ws-mention ws-vars pointer-events-auto rounded-2xl p-3 text-left"
          style={packVars(c.pack)}
          onClick={() => {
            const st = useApp.getState();
            st.openServer(c.serverId);
            if (c.channelId) st.openChannel(c.serverId, c.channelId);
            useOverlays.setState((s) => ({ mentions: s.mentions.filter((x) => x.id !== c.id) }));
          }}
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black tracking-[0.18em] uppercase" style={{ color: c.pack.colors.a, fontFamily: c.pack.font }}>
            <AtSign size={12} />
            {c.pack.notify.label}
          </div>
          <div className="flex gap-2.5">
            <Avatar name={c.author} color={c.avatarColor} src={c.avatarUrl} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">
                {c.author} <span className="font-normal opacity-70">em {c.where}</span>
              </div>
              <div className="line-clamp-2 text-sm opacity-85">{c.text}</div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

export function WorkshopHosts() {
  const studioFor = useWorkshop((s) => s.studioFor);
  if (!WORKSHOP_ENABLED) return null;
  return (
    <>
      {studioFor && <Studio serverId={studioFor} />}
      <Mentions />
      <Announcer />
      <Intro />
    </>
  );
}
