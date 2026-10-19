// Patch de presente: página animada em /resgatar/<código> e o popup de "equipar" depois do resgate.
import { Gift, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { api } from '../lib/api';
import type { Patch } from '../lib/types';
import { useApp } from '../store/app';
import { toast } from '../store/toast';
import { Patch3D } from './Patch3D';
import { equipPatch } from './ServerPatches';
import { Avatar, Button, Modal, Spinner } from './ui';

export interface DropInfo {
  code: string;
  patch: Patch;
  creator: { displayName: string; avatarUrl: string | null; avatarColor: string; frame: string | null };
  remaining: number | null;
  expiresAt: number | null;
  available: boolean;
  claimed: boolean;
}

type Stage = 'page' | 'login' | 'claim' | null;

const codeFromUrl = () => /^\/resgatar\/([\w-]{4,40})\/?$/.exec(location.pathname)?.[1] ?? null;

export const useDrop = create<{ code: string | null; stage: Stage; patch: Patch | null; set: (p: Partial<{ stage: Stage; patch: Patch | null }>) => void; done: () => void }>(
  (set) => {
    const code = codeFromUrl();
    return {
      code,
      stage: code ? 'page' : null,
      patch: null,
      set: (p) => set(p),
      done: () => {
        history.replaceState(null, '', '/');
        set({ code: null, stage: null, patch: null });
      },
    };
  },
);

async function claim(code: string) {
  try {
    const { patch } = await api.post<{ patch: Patch }>(`/drops/${encodeURIComponent(code)}/claim`);
    useDrop.getState().set({ stage: 'claim', patch });
  } catch (err) {
    toast.error(err);
    useDrop.getState().done();
  }
}

/** Quem entrou pela página de resgate sem conta: assim que fizer login, resgata e mostra o popup. */
export function useClaimAfterLogin() {
  const me = useApp((s) => s.me);
  const stage = useDrop((s) => s.stage);
  const code = useDrop((s) => s.code);
  useEffect(() => {
    if (me && stage === 'login' && code) void claim(code);
  }, [me, stage, code]);
}

// ------------------------------------------------------------------ página pública

export function DropPage() {
  const code = useDrop((s) => s.code)!;
  const me = useApp((s) => s.me);
  const [info, setInfo] = useState<DropInfo | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<DropInfo>(`/drops/${encodeURIComponent(code)}`).then(setInfo, (e) => setError((e as Error).message));
  }, [code]);

  async function go() {
    if (!me) {
      useDrop.getState().set({ stage: 'login' });
      return;
    }
    setBusy(true);
    await claim(code);
    setBusy(false);
  }

  const name = info?.patch.text?.trim();
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-surface-0 px-4 text-center">
      {/* brilho atrás do patch */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-[62%] rounded-full bg-accent/25 blur-[140px]" />
      <div className="pointer-events-none absolute right-[-10%] bottom-[-20%] h-[420px] w-[420px] rounded-full bg-accent-2/15 blur-[120px]" />
      <img src="/brand/concord-logo.png" alt="Concord" className="absolute top-6 left-1/2 h-9 -translate-x-1/2" />

      {error ? (
        <div className="relative max-w-sm">
          <Gift size={40} className="mx-auto mb-3 text-fg-muted" />
          <h1 className="text-2xl font-bold">{error}</h1>
          <Button className="mt-6" onClick={() => useDrop.getState().done()}>
            Ir para o Concord
          </Button>
        </div>
      ) : !info ? (
        <Spinner size={36} />
      ) : (
        <div className="relative flex flex-col items-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold tracking-wider text-accent uppercase">
            <Sparkles size={13} /> Patch de presente
          </span>
          <Patch3D patch={info.patch} size={Math.min(300, window.innerWidth - 120)} showcase />
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{name ? `Patch ${name}` : 'Um patch exclusivo'} pra você!</h1>
          <p className="mt-2 flex items-center justify-center gap-2 text-fg-muted">
            <Avatar name={info.creator.displayName} color={info.creator.avatarColor} src={info.creator.avatarUrl} frame={info.creator.frame} size={24} />
            <b className="text-fg">{info.creator.displayName}</b> te mandou um bordado para o seu perfil.
          </p>
          {info.remaining !== null && info.available && (
            <p className="mt-1 text-sm text-fg-subtle">
              {info.remaining === 1 ? 'Só resta 1 resgate' : `Restam ${info.remaining} resgates`}
            </p>
          )}

          {info.claimed ? (
            <>
              <p className="mt-6 font-semibold text-ok">Você já resgatou este patch.</p>
              <Button className="mt-3" onClick={() => useDrop.getState().done()}>
                Abrir o Concord
              </Button>
            </>
          ) : info.available ? (
            <Button className="mt-7 h-12 px-8 text-base" loading={busy} onClick={() => void go()}>
              <Gift size={18} /> {me ? 'Resgatar patch' : 'Entrar para resgatar'}
            </Button>
          ) : (
            <>
              <p className="mt-6 font-semibold text-fg-muted">{info.remaining === 0 ? 'Os resgates deste patch acabaram.' : 'Este link de presente expirou.'}</p>
              <Button variant="secondary" className="mt-3" onClick={() => useDrop.getState().done()}>
                Ir para o Concord
              </Button>
            </>
          )}
          {!me && info.available && !info.claimed && <p className="mt-3 text-xs text-fg-subtle">Ainda não tem conta? Dá pra criar na próxima tela, leva 10 segundos.</p>}
          <p className="mt-6 text-xs text-fg-subtle">Arraste o patch para girar</p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ popup depois do resgate

export function DropClaimModal() {
  const patch = useDrop((s) => s.patch)!;
  const done = useDrop((s) => s.done);
  const me = useApp((s) => s.me)!;
  const [busy, setBusy] = useState(false);
  const equipped = (me.patches ?? []).some((p) => p.id === patch.id);
  const name = patch.text?.trim();

  async function equip() {
    setBusy(true);
    if (await equipPatch(patch)) {
      toast.success(`Patch ${name || 'novo'} costurado no seu perfil!`);
      done();
    }
    setBusy(false);
  }

  return (
    <Modal onClose={() => done()} width={440}>
      <div className="flex flex-col items-center text-center">
        <Patch3D patch={patch} size={190} showcase />
        <h2 className="font-display text-2xl font-extrabold">{name ? `Patch ${name} resgatado!` : 'Patch resgatado!'} 🎉</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {equipped ? 'Ele já está no seu perfil.' : 'Quer costurar no seu perfil agora? Todo mundo vê no seu cartão.'}
        </p>
        <div className="mt-5 flex w-full gap-2">
          {equipped ? (
            <Button className="flex-1" onClick={() => done()}>
              Fechar
            </Button>
          ) : (
            <>
              <Button variant="secondary" className="flex-1" onClick={() => {
                toast.info('Ele fica guardado em Configurações > Estilo > Patches.');
                done();
              }}>
                Agora não
              </Button>
              <Button className="flex-1" loading={busy} onClick={() => void equip()}>
                Equipar no perfil
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
