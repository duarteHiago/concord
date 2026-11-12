// O que a Oficina desenha por cima do app: intro, anunciador da sala, avisos de menção e o editor.
// Animado com Motion (molas), carregado sob demanda pelo App.
import { AtSign } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { lazy, Suspense, useEffect } from 'react';
import { useApp } from '../store/app';
import { Avatar } from '../components/ui';
import { packVars } from './Art';
import { motionPref, springs, squash } from './motion';
import { PackEmblem } from './PackEmblem';
import { Particles } from './Particles';
import { BURST, SceneBackdrop, particleColors } from './Scene';
import { useOverlays } from './runtime';
import { WORKSHOP_ENABLED, useWorkshop } from './store';

const Studio = lazy(() => import('./Studio').then((m) => ({ default: m.Studio })));

function Intro() {
  const intro = useOverlays((s) => s.intro);
  useEffect(() => {
    if (!intro) return;
    const done = () => useOverlays.setState((s) => (s.intro?.key === intro.key ? { intro: null } : s));
    const t = setTimeout(done, 3100);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && done();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [intro]);

  return (
    <AnimatePresence>
      {intro && (
        <motion.div
          key={intro.key}
          className="ws-intro ws-vars"
          style={packVars(intro.pack)}
          onClick={() => useOverlays.setState({ intro: null })}
          role="status"
          aria-label={`${intro.pack.intro.kicker}: ${intro.name}`}
          // abre em círculo a partir do centro; sai crescendo e desfocando (o "dissolver" da Apple)
          initial={{ clipPath: 'circle(0% at 50% 45%)', opacity: 1 }}
          animate={{ clipPath: 'circle(150% at 50% 45%)', opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 1.06, filter: 'blur(10px)', transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] } }}
          transition={{ clipPath: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }}
        >
          {/* cena: shader do pacote + partículas no ar; o estouro sai do emblema quando ele pousa */}
          <SceneBackdrop pack={intro.pack} focus={0.12} density={45} />
          <Particles mode={BURST[intro.pack.art]} colors={particleColors(intro.pack)} burst count={80} origin={{ x: 0.5, y: 0.36 }} delay={380} />
          <div className="relative z-10 flex flex-col items-center gap-[10px]">
          <div className="relative flex items-center justify-center">
            {/* raios de luz girando atrás do emblema */}
            <motion.span
              className="pointer-events-none absolute rounded-full"
              style={{
                width: 520,
                height: 520,
                background: `repeating-conic-gradient(from 0deg, ${intro.pack.colors.glow} 0deg 5deg, transparent 5deg 20deg)`,
                WebkitMaskImage: 'radial-gradient(circle, black 18%, transparent 68%)',
                maskImage: 'radial-gradient(circle, black 18%, transparent 68%)',
              }}
              initial={{ opacity: 0, scale: 0.4, rotate: 0 }}
              animate={{ opacity: 0.55, scale: 1, rotate: 360 }}
              transition={{ opacity: { duration: 0.6, delay: 0.35 }, scale: { ...springs.soft, delay: 0.35 }, rotate: { duration: 40, repeat: Infinity, ease: 'linear' } }}
            />
            {/* onda de choque quando o emblema "pousa" */}
            <motion.span
              className="absolute rounded-full border-4"
              style={{ width: 170, height: 170, borderColor: intro.pack.colors.a }}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: [0.6, 2.4], opacity: [0.7, 0] }}
              transition={{ duration: 0.9, ease: 'easeOut', delay: 0.36 }}
            />
            <motion.div
              className="ws-intro-emblem"
              initial={{ y: -160, scaleX: 0.3, scaleY: 0.3, rotate: -30, opacity: 0 }}
              animate={{ y: [-160, 0, -18, 0], scaleX: squash.scaleX, scaleY: squash.scaleY, rotate: [-30, 6, -2, 0], opacity: 1 }}
              transition={{ duration: 0.85, times: squash.times, ease: 'easeOut', opacity: { duration: 0.2 } }}
            >
              {/* depois de pousar, flutua de leve */}
              <motion.div animate={{ y: [0, -7, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.9 }}>
                <PackEmblem pack={intro.pack} size={170} />
              </motion.div>
            </motion.div>
          </div>
          <motion.div
            className="ws-intro-kicker"
            initial={{ opacity: 0, letterSpacing: '0.8em', y: 8 }}
            animate={{ opacity: 1, letterSpacing: '0.32em', y: 0 }}
            transition={{ ...springs.soft, delay: 0.45 }}
          >
            {intro.pack.intro.kicker}
          </motion.div>
          <div className="ws-intro-name" style={{ fontFamily: intro.pack.font, ['--ws-name-grad' as string]: `linear-gradient(180deg, ${intro.pack.colors.ink} 35%, ${intro.pack.colors.a})` }} aria-hidden="true">
            {[...intro.name].map((ch, i) => (
              <motion.span
                key={i}
                className="ws-grad-text inline-block whitespace-pre"
                initial={{ y: 46, opacity: 0, rotate: 14, scale: 0.5 }}
                animate={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
                transition={{ ...springs.bouncy, delay: 0.55 + i * 0.035 }}
              >
                {ch}
              </motion.span>
            ))}
          </div>
          <motion.div
            className="ws-intro-line"
            initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
            animate={{ opacity: 0.85, y: 0, filter: 'blur(0px)' }}
            transition={{ ...springs.soft, delay: 0.75 + intro.name.length * 0.035 }}
          >
            {intro.pack.intro.line}
          </motion.div>
          <div className="ws-intro-bar">
            <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 2.9, ease: 'linear' }} style={{ originX: 0 }} />
          </div>
          <motion.div className="mt-3 text-[11px]" initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 1.2 }}>
            clique para pular
          </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Announcer() {
  const a = useOverlays((s) => s.announce);
  useEffect(() => {
    if (!a) return;
    const t = setTimeout(() => useOverlays.setState((s) => (s.announce?.key === a.key ? { announce: null } : s)), 2600);
    return () => clearTimeout(t);
  }, [a]);
  return (
    <AnimatePresence>
      {a && (
        <motion.div
          key={a.key}
          className="ws-announce ws-vars"
          style={{ ...packVars(a.pack), x: '-50%' }}
          role="status"
          initial={{ y: -90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -30, opacity: 0, scale: 0.92, filter: 'blur(4px)', transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } }}
          transition={springs.bouncy}
        >
          {/* amassa ao pousar, como uma faixa de borracha */}
          <motion.div
            className="ws-announce-ribbon"
            style={{ fontFamily: a.pack.font }}
            initial={{ scaleX: 1.25, scaleY: 0.6 }}
            animate={{ scaleX: [1.25, 0.92, 1.04, 1], scaleY: [0.6, 1.14, 0.97, 1] }}
            transition={{ duration: 0.6, times: [0, 0.4, 0.7, 1], ease: 'easeOut', delay: 0.08 }}
          >
            {[...a.text].map((ch, i) => (
              <motion.span
                key={i}
                className="inline-block whitespace-pre"
                initial={{ y: 14, opacity: 0, scale: 0.4 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ ...springs.jelly, delay: 0.16 + i * 0.022 }}
              >
                {ch}
              </motion.span>
            ))}
          </motion.div>
          <div className="pointer-events-none absolute -inset-x-48 -inset-y-28">
            <Particles mode={BURST[a.pack.art]} colors={particleColors(a.pack)} burst count={45} delay={120} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Mentions() {
  const cards = useOverlays((s) => s.mentions);
  return (
    <div className="pointer-events-none fixed right-5 bottom-24 z-[65] flex w-80 max-w-[calc(100vw-2.5rem)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {cards.map((c) => (
          <motion.button
            key={c.id}
            layout
            type="button"
            className="ws-mention ws-vars pointer-events-auto rounded-2xl p-3 text-left"
            style={packVars(c.pack)}
            initial={{ x: 140, opacity: 0, rotate: 8, scale: 0.85 }}
            animate={{ x: 0, opacity: 1, rotate: 0, scale: 1 }}
            exit={{ x: 90, opacity: 0, scale: 0.9, filter: 'blur(4px)', transition: { duration: 0.25 } }}
            transition={springs.bouncy}
            whileHover={{ y: -3, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              const st = useApp.getState();
              st.openServer(c.serverId);
              if (c.channelId) st.openChannel(c.serverId, c.channelId);
              useOverlays.setState((s) => ({ mentions: s.mentions.filter((x) => x.id !== c.id) }));
            }}
          >
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black tracking-[0.18em] uppercase" style={{ color: c.pack.colors.a, fontFamily: c.pack.font }}>
              <motion.span className="inline-flex" initial={{ rotate: -90, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ ...springs.jelly, delay: 0.12 }}>
                <AtSign size={12} />
              </motion.span>
              {c.pack.notify.label}
            </div>
            <div className="flex gap-2.5">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...springs.jelly, delay: 0.08 }}>
                <Avatar name={c.author} color={c.avatarColor} src={c.avatarUrl} size={34} />
              </motion.div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">
                  {c.author} <span className="font-normal opacity-70">em {c.where}</span>
                </div>
                <div className="line-clamp-2 text-sm opacity-85">{c.text}</div>
              </div>
            </div>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function WorkshopHosts() {
  const studioFor = useWorkshop((s) => s.studioFor);
  if (!WORKSHOP_ENABLED) return null;
  return (
    <MotionConfig reducedMotion={motionPref()}>
      <AnimatePresence>
        {studioFor && (
          <Suspense fallback={null}>
            <Studio key={studioFor} serverId={studioFor} />
          </Suspense>
        )}
      </AnimatePresence>
      <Mentions />
      <Announcer />
      <Intro />
    </MotionConfig>
  );
}
