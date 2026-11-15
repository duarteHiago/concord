import { Compass, Users } from 'lucide-react';
import { Frame, Spot, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

const SAMPLE = [
  { initials: 'CA', color: '#e67e22', name: 'Clube do Anime', desc: 'Maratonas toda sexta', online: 12, members: 140 },
  { initials: 'RB', color: '#e05260', name: 'RPG de Mesa BR', desc: 'Mesas abertas para iniciantes', online: 7, members: 86 },
];

function DescobrirArt() {
  return (
    <Frame className="flex h-[170px] flex-col justify-center gap-2 px-4">
      {SAMPLE.map((s, i) => (
        <div key={s.name} className="flex items-center gap-2.5 rounded-xl bg-surface-3 p-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl text-xs font-bold text-white" style={{ background: s.color }}>
            {s.initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-bold">{s.name}</div>
            <div className="flex items-center gap-2 text-[10px] text-fg-muted">
              <span>{s.desc}</span>
              <span className="flex items-center gap-0.5">
                <Users size={10} /> {s.members}
              </span>
            </div>
          </div>
          {i === 0 ? (
            <Spot rounded="rounded-full" className="bg-accent px-3 py-1 text-[11px] font-bold text-on-accent">
              Entrar
            </Spot>
          ) : (
            <span className="rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-on-accent">Entrar</span>
          )}
        </div>
      ))}
      <Tag className="top-3 right-3">
        <Compass size={11} className="mr-1 inline" /> Sem convite
      </Tag>
    </Frame>
  );
}

export default {
  id: '2026-11-14-1410',
  title: 'Descobrir servidores e rascunho salvo',
  highlights: [
    {
      kicker: 'Servidores',
      title: 'Ache servidores públicos e entre sem convite',
      text: 'O botão da bússola, na fileira de servidores, abre "Descobrir": servidores públicos com descrição, quem está online e quantos membros têm. É só clicar em Entrar. Quem gerencia um servidor pode abrir o seu em Configurações do servidor → Servidor público.',
      art: DescobrirArt,
    },
  ],
  also: ['O que você começou a escrever fica guardado em cada canal e conversa, mesmo trocando de canal ou recarregando a página.'],
  fixes: [],
} satisfies Release;
