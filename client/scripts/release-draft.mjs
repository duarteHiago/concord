// Rascunho de uma edição de Novidades: lista os feat/fix desde a última edição e cria
// src/releases/AAAA-MM-DD.tsx (hoje, ou a data passada como argumento) para você escolher os destaques.
//   npm run release:draft            -> edição de hoje
//   npm run release:draft 2026-11-02 -> edição com essa data
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';

const dir = new URL('../src/releases/', import.meta.url);
const id = process.argv[2] ?? new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local
if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) {
  console.error(`Data inválida: "${id}". Use AAAA-MM-DD.`);
  process.exit(1);
}
const file = new URL(`${id}.tsx`, dir);
if (existsSync(file)) {
  console.error(`Já existe src/releases/${id}.tsx.`);
  process.exit(1);
}

const previous = readdirSync(dir)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.tsx$/.test(f))
  .map((f) => f.slice(0, 10))
  .sort()
  .at(-1);

// depois do dia da última edição (o próprio dia já entrou nela)
const since = previous ? ['--since', `${previous} 23:59:59`] : [];
const subjects = execFileSync('git', ['log', '--no-merges', '--format=%s', ...since], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const pick = (type) => subjects.filter((s) => new RegExp(`^${type}(\\(.+\\))?!?:`).test(s)).map((s) => s.replace(/^\w+(\(.+\))?!?:\s*/, ''));
const feats = pick('feat');
const fixes = pick('fix');
const comment = (list) => (list.length ? list.map((s) => `    // ${s}`).join('\n') : '    // (nada desde a última edição)');

writeFileSync(
  file,
  `import { Frame, Tag } from '../components/modals/OnboardingArt';
import type { Release } from './index';

// Escolha até 4 destaques (o que muda como a pessoa usa o app), escreva do ponto de vista de quem usa e apague o que sobrar.
// Desde ${previous ?? 'o começo'}:
//
// feat
${comment(feats).replace(/^ {4}/gm, '')}
//
// fix
${comment(fixes).replace(/^ {4}/gm, '')}

function ExampleArt() {
  return (
    <Frame className="h-[170px]">
      <Tag className="right-3 bottom-3">Troque por uma "foto" do recurso</Tag>
    </Frame>
  );
}

export default {
  id: '${id}',
  title: 'TODO: título curto da edição',
  highlights: [
    {
      kicker: 'TODO',
      title: 'TODO',
      text: 'TODO',
      art: ExampleArt,
    },
  ],
  also: [],
  fixes: [],
} satisfies Release;
`,
);

console.log(`Criado src/releases/${id}.tsx com ${feats.length} feat e ${fixes.length} fix desde ${previous ?? 'o começo'}.`);
