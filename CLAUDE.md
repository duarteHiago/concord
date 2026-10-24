# Concord

Chat de voz e texto (servidores, canais, salas de voz com transmissão de tela) com cliente web/desktop.
`client/` (React + Vite + Tailwind), `server/` (Node + Express + SQLite + Socket.io), `desktop/` (Electron),
`shared/` (código usado pelos dois lados). O app é em português do Brasil.

## Todo PR com mudança visível leva a sua nota de Novidades

Regra do projeto, vale para todo mundo e todo Claude que trabalha aqui: **quando um PR muda algo que quem usa
o app vê ou sente, a nota de Novidades vai junto, no mesmo PR**, sem precisar pedir. É um arquivo novo em
`client/src/releases/AAAA-MM-DD-HHMM-assunto.tsx`, que aparece na página "Novidades" e na apresentação que
abre sozinha depois da atualização.

- Como escrever (níveis, tom, arte, ação e spotlight): use o skill **`novidades`** (`.claude/skills/novidades/SKILL.md`).
- Rascunho: `npm run release:draft <assunto>` dentro de `client/`.
- PR só interno (dependências, CI, deploy, testes, refatoração, portal `/admin`): sem nota, com o rótulo
  `sem-novidade`.
- O CI tem um job "Novidades" que falha em PR `feat`/`fix` sem nota e sem o rótulo. Não faça merge com ele vermelho.

## PRs e commits

- Título no formato Conventional Commits (`feat(chat): ...`, `fix(voice): ...`), em inglês, como os anteriores.
- Commits assinados. Squash merge.
- Merge na `main` faz deploy na VPS sozinho (`.github/workflows/ci-cd.yml`), depois dos testes.
- Se o PR guarda um dado novo das pessoas, atualize `client/public/privacidade/`.
