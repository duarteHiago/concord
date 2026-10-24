// Rascunho da nota de Novidades deste PR: cria src/releases/AAAA-MM-DD-HHMM-<assunto>.tsx (hora de Brasília)
// com os commits da branch que ainda não estão na main, para escolher os destaques e escrever.
//   npm run release:draft figurinhas     -> src/releases/2026-10-24-1830-figurinhas.tsx
// Como escrever: .claude/skills/novidades/SKILL.md
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const slug = (process.argv[2] ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
if (!slug) {
  console.error('Diga o assunto da nota: npm run release:draft figurinhas');
  process.exit(1);
}

// AAAA-MM-DD-HHMM no horário de Brasília (UTC-3, sem horário de verão)
const brt = new Date(Date.now() - 3 * 3_600_000).toISOString();
const id = `${brt.slice(0, 10)}-${brt.slice(11, 13)}${brt.slice(14, 16)}`;
const name = `${id}-${slug}.tsx`;
const file = new URL(`../src/releases/${name}`, import.meta.url);
if (existsSync(file)) {
  console.error(`Já existe src/releases/${name}.`);
  process.exit(1);
}

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
};
const base = git('rev-parse', '--verify', '--quiet', 'origin/main') ? 'origin/main' : 'main';
const subjects = git('log', '--no-merges', '--format=%s', `${base}..HEAD`).split('\n').filter(Boolean);
const pick = (type) => subjects.filter((s) => new RegExp(`^${type}(\\(.+\\))?!?:`).test(s)).map((s) => s.replace(/^\w+(\(.+\))?!?:\s*/, ''));
const list = (items) => (items.length ? items.map((s) => `// ${s}`).join('\n') : '// (nenhum)');

writeFileSync(
  file,
  `import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

// Commits desta branch (${base}..HEAD). Escreva do ponto de vista de quem usa o app e apague estes comentários.
//
// feat
${list(pick('feat'))}
//
// fix
${list(pick('fix'))}

function Art() {
  return (
    <Frame className="h-[170px]">
      <Tag className="right-3 bottom-3">Troque por uma "foto" do recurso</Tag>
    </Frame>
  );
}

export default {
  id: '${id}',
  title: 'TODO: título curto',
  highlights: [
    {
      kicker: 'TODO',
      title: 'TODO',
      text: 'TODO',
      art: Art,
    },
  ],
  also: [],
  fixes: [],
} satisfies Release;
`,
);

console.log(`Criado src/releases/${name}. Preencha seguindo .claude/skills/novidades/SKILL.md.`);
