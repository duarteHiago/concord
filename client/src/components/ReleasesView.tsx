import { ArrowRight, Newspaper, Play, Plus, Target, Wrench, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RELEASE_DAYS, markReleasesSeen, releaseDate, unseenReleases, type Highlight, type Release } from '../releases';
import { useApp } from '../store/app';
import { RecapList } from './modals/WhatsNewModal';
import { showSpotlight } from './Spotlight';
import { Button, IconButton } from './ui';

/** Página "Novidades": tudo que chegou ao Concord, para quem pulou a apresentação ou quer lembrar o que saiu. */
export function ReleasesView() {
  const closeReleases = useApp((s) => s.closeReleases);
  // guarda o "já vi" de quando a página abriu, para marcar as edições novas mesmo depois de salvar como vistas
  const [fresh] = useState(() => new Set(unseenReleases(useApp.getState().me?.settings.lastSeenRelease).map((r) => r.id)));

  useEffect(() => markReleasesSeen(), []);

  return (
    <main className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-4 border-b border-line px-8 py-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Newspaper size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold">Novidades</h1>
          <p className="text-sm text-fg-muted">Tudo que chegou ao Concord, da atualização mais recente para a mais antiga.</p>
        </div>
        <IconButton label="Fechar" className="h-9 w-9 shrink-0" onClick={closeReleases}>
          <X size={18} />
        </IconButton>
      </header>
      <div className="flex-1 overflow-y-auto">
        <ol className="mx-auto max-w-3xl px-8 py-8">
          {RELEASE_DAYS.map((d, i) => (
            <Edition key={d.day} day={d.day} releases={d.releases} fresh={d.releases.some((r) => fresh.has(r.id))} last={i === RELEASE_DAYS.length - 1} />
          ))}
        </ol>
      </div>
    </main>
  );
}

/** Uma edição = as notas de um dia (cada PR traz a sua). */
function Edition({ day, releases, fresh, last }: { day: string; releases: Release[]; fresh: boolean; last: boolean }) {
  const openModal = useApp((s) => s.openModal);
  // a mais antiga do dia primeiro, na ordem em que as coisas entraram
  const inOrder = [...releases].reverse();
  const release = {
    id: day,
    title: inOrder.map((r) => r.title).join(' · '),
    highlights: inOrder.flatMap((r) => r.highlights),
    also: inOrder.flatMap((r) => r.also ?? []),
    fixes: inOrder.flatMap((r) => r.fixes ?? []),
  };
  return (
    <li className="grid grid-cols-[14px_1fr] gap-x-5">
      {/* linha do tempo */}
      <div className="relative">
        <span className={`absolute top-1.5 left-0 h-3.5 w-3.5 rounded-full border-[3px] border-surface-2 ${fresh ? 'bg-accent' : 'bg-surface-4'}`} />
        {!last && <span className="absolute top-6 bottom-0 left-[6px] w-0.5 bg-line-strong" />}
      </div>
      <section className={last ? '' : 'pb-12'} aria-labelledby={`release-${release.id}`}>
        <div className="flex items-center gap-2">
          <time dateTime={release.id} className="font-mono text-xs text-fg-subtle">
            {releaseDate(release.id)}
          </time>
          {fresh && <span className="rounded-full bg-accent px-2 py-px font-display text-[10px] font-extrabold tracking-wide text-on-accent">NOVO</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id={`release-${release.id}`} className="text-lg font-bold text-balance">
            {release.title}
          </h2>
          {release.highlights.length > 0 && (
            <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => openModal({ type: 'whatsNew', ids: releases.map((r) => r.id) })}>
              <Play size={13} /> Rever apresentação
            </Button>
          )}
        </div>

        {release.highlights.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {release.highlights.map((h) => (
              <HighlightCard key={h.title} h={h} />
            ))}
          </div>
        )}

        {!!(release.also?.length || release.fixes?.length) && (
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {release.also?.length ? <RecapList icon={Plus} title="Também chegou" items={release.also} /> : null}
            {release.fixes?.length ? <RecapList icon={Wrench} title="Consertamos" items={release.fixes} check /> : null}
          </div>
        )}
      </section>
    </li>
  );
}

function HighlightCard({ h }: { h: Highlight }) {
  const closeReleases = useApp((s) => s.closeReleases);
  const Art = h.art;
  // o botão apontado mora na tela de conversa: fecha a página e aponta depois que ela voltar
  const spotlight = () => {
    closeReleases();
    setTimeout(() => showSpotlight(h.spotlight!), 80);
  };
  return (
    <article className="flex flex-col gap-3 rounded-3xl bg-surface-3/60 p-3 ring-1 ring-line">
      <Art />
      <div className="flex-1 px-1">
        <span className="font-display text-[10.5px] font-bold tracking-widest text-accent-2 uppercase">{h.kicker}</span>
        <h3 className="mt-0.5 font-bold text-balance">{h.title}</h3>
        <p className="mt-1 text-sm text-fg-muted">{h.text}</p>
      </div>
      {(h.action || h.spotlight) && (
        <div className="flex flex-wrap gap-2 px-1 pb-1">
          {h.spotlight && (
            <Button variant="secondary" className="h-8 px-3 text-xs" onClick={spotlight}>
              <Target size={13} /> Mostrar onde fica
            </Button>
          )}
          {h.action && (
            <Button variant="secondary" className="h-8 px-3 text-xs" onClick={h.action.run}>
              {h.action.label} <ArrowRight size={13} />
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
