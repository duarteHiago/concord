# Como contribuir com o Concord

Valeu por querer ajudar! Este guia explica como rodar o projeto, como o código está organizado, como trabalhar com issues, branches e commits, e o que conferir antes de subir uma mudança. Também tem uma versão ilustrada em [concord-community.com/contribuir](https://concord-community.com/contribuir/).

Ao participar, você concorda com o nosso [Código de Conduta](CODE_OF_CONDUCT.md).

> **Importante:** o que entra na `main` passa pelos testes e, se passar, **vai direto para produção** (concord-community.com). Por isso as mudanças entram por pull request (veja [Fluxo de trabalho](#fluxo-de-trabalho-github-flow)).

## Rodando localmente

### Jeito rápido (só Docker)

Pré-requisito: Docker Desktop.

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

Abra http://localhost:3000, crie uma conta e um servidor. Para simular outra pessoa, use uma janela anônima e entre pelo convite. A cada mudança no código é preciso rodar o comando de novo (ele refaz a imagem).

### Desenvolvendo com recarga automática

Pré-requisitos: Node 24 e Docker Desktop (só para o LiveKit, o servidor de voz e vídeo).

```bash
# 1. LiveKit (voz/vídeo)
docker compose -f docker-compose.dev.yml up -d livekit

# 2. Servidor (reinicia sozinho a cada mudança) — http://localhost:3000
cd server && npm install && npm run dev

# 3. Cliente (outro terminal) — http://localhost:5173
cd client && npm install && npm run dev
```

Use o endereço do cliente (porta 5173): o Vite repassa `/api`, `/socket.io` e `/livekit` para o servidor e o LiveKit. O banco de desenvolvimento fica em `server/data/concord.db`. Apague o arquivo para começar do zero.

### App desktop (Windows)

```bash
cd desktop && npm install && npm start
```

O app desktop é uma "casca" Electron que carrega o site do servidor configurado. Mudanças no cliente aparecem nele sem gerar instalador novo. Só mudanças em `desktop/` exigem um instalador novo.

## Organização do código

| Pasta | O que tem |
|---|---|
| `client/` | Interface (React 19 + Vite + Tailwind 4). Estado em `src/store/`, telas em `src/components/` |
| `server/` | API (Express 5), tempo real (Socket.io) e banco (SQLite via `node:sqlite`). Rotas em `src/api.ts`, esquema e migrações em `src/db.ts` |
| `shared/` | Código usado pelos dois lados: permissões, cosméticos, fórum |
| `desktop/` | App Windows (Electron) e o capturador de áudio nativo |
| `deploy/` | Instalação na VPS, Caddy, LiveKit e monitoramento (Grafana) |
| `tests/e2e/` | Teste de ponta a ponta com dois navegadores (voz + transmissão de tela) |
| `docs/` | Roadmap e documentação de bots |

O servidor roda TypeScript direto no Node 24, sem etapa de build.

## Convenções

- **Textos da interface em português do Brasil**, curtos e diretos. Mensagens de erro dizem o que aconteceu e o que fazer (ex.: "Esse link expirou. Peça outro em 'Esqueci minha senha'.").
- **Comentários em português**, explicando o *porquê* quando não for óbvio, não o *o quê*.
- **Siga o estilo do código ao redor**: nomes, padrões e quantidade de comentários. Na dúvida, procure uma funcionalidade parecida e copie o jeito dela.
- **Dependências novas só com motivo.** Várias coisas foram feitas sem biblioteca de propósito (ex.: o envio de e-mail usa `fetch` direto na API do Brevo).
- **Privacidade:** o Concord não usa rastreadores nem analytics. Se a mudança passar a guardar um dado novo das pessoas, atualize a política em `client/public/privacidade/index.html` no mesmo commit.
- **Segurança:**
  - Arquivos enviados pelas pessoas são conferidos pelos bytes, não só pelo nome.
  - O que não é imagem é sempre baixado, nunca aberto como página do site.
  - Rotas que mandam e-mail ou aceitam senha têm limite de tentativas (`limiter` em `server/src/recovery.ts`).

### Banco de dados

O esquema e as migrações ficam em `server/src/db.ts`. Coluna nova se adiciona com `addColumn(tabela, coluna, ddl)`, que só cria se ainda não existir.

⚠️ O `addColumn` tem que vir **depois** do `CREATE TABLE` da tabela. Num banco que já existe isso passa despercebido, mas num banco novo o servidor não sobe. O teste E2E, que começa do zero, pega esse erro.

## Antes de subir

Rode na sua máquina:

```bash
cd server && npx tsc --noEmit     # checagem de tipos do servidor
cd client && npm run build        # checagem de tipos + build do cliente
```

Se mexeu em voz, vídeo, login ou no banco, rode também o teste E2E (precisa do Docker):

```bash
docker build -t concord-app:test . && docker compose -f tests/e2e/docker-compose.yml run --rm pw
```

E teste o fluxo na mão no navegador, com duas contas se a mudança envolver outra pessoa.

## Fluxo de trabalho (GitHub Flow)

A `main` é sempre o que está em produção. Toda mudança passa por uma branch e um pull request:

1. Atualize a `main` e crie uma branch a partir dela:
   ```bash
   git switch main && git pull
   git switch -c fix/chat-scroll-flicker
   ```
2. Faça os commits na branch e suba: `git push -u origin fix/chat-scroll-flicker`.
3. Abra o pull request (`gh pr create` ou pelo GitHub). O PR roda os testes, **sem deploy**.
4. Com os testes passando (e revisão, se a mudança for grande), faça o merge com **"Squash and merge"**. Isso junta a branch num único commit na `main`, e esse merge dispara o deploy.
5. Apague a branch depois do merge.

### Nome da branch

`tipo/descricao-curta`, em inglês, minúsculas e com hífens. Os tipos são os mesmos dos commits (abaixo):

- `feat/file-attachments`
- `fix/desktop-google-login`
- `docs/contributing-guide`
- `chore/update-livekit`

Se a branch resolve uma issue, dá para pôr o número: `fix/9-arc-raiders-ping`.

## Commits ([Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/))

Formato do título: `tipo(escopo opcional): descrição`, em inglês, no imperativo, em minúsculas e sem ponto final, com até ~72 caracteres.

```
fix(voice): show muted and deafened icons together
feat(chat): add file attachments to channels and DMs
docs: add contributing guide
```

| Tipo | Quando usar |
|---|---|
| `feat` | Funcionalidade nova |
| `fix` | Correção de bug |
| `perf` | Melhoria de desempenho |
| `refactor` | Mudança de código que não altera o comportamento |
| `style` | Só formatação, sem mudar lógica |
| `docs` | Documentação (README, guias, comentários) |
| `test` | Testes |
| `build` | Dependências e build (npm, Docker, Electron) |
| `ci` | Pipelines do GitHub Actions |
| `chore` | Manutenção que não entra em nenhuma das outras |

Escopos usados no projeto: `client`, `server`, `desktop`, `voice`, `chat`, `auth`, `deploy`, `db`. São opcionais: use quando ajudar a achar a mudança no histórico.

Para mudanças que quebram compatibilidade (ex.: exigem mexer no `.env` da VPS ou derrubam versões antigas do app desktop), use `!` depois do tipo e explique no rodapé: `feat(auth)!: require email verification` + `BREAKING CHANGE: ...`.

- **Corpo explicando o porquê**: qual era o problema, a causa e o que mudou. Quem ler o histórico daqui a meses precisa entender sem abrir o código.
- **Para fechar uma issue sozinha, use `Closes #N`** no corpo do commit ou na descrição do PR. Escrever só "(issue #N)" cria o link, mas **não fecha** a issue.

### Commits assinados (obrigatório)

O repositório **recusa push de commits sem assinatura verificada**, em qualquer branch. A assinatura prova que o commit foi feito por você, e não por alguém que só colocou o seu nome e e-mail no Git. No GitHub, os commits assinados aparecem com o selo **Verified**.

Configuração (uma vez por computador), com uma chave SSH só para assinar:

```bash
# 1. Crie a chave (use o e-mail da sua conta do GitHub)
ssh-keygen -t ed25519 -C "seu@email.com" -f ~/.ssh/github_signing

# 2. Faça o Git assinar tudo com ela
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/github_signing.pub
git config --global commit.gpgsign true
git config --global tag.gpgsign true

# 3. Cadastre a chave no GitHub como chave de ASSINATURA
gh auth refresh -h github.com -s admin:ssh_signing_key
gh ssh-key add ~/.ssh/github_signing.pub --type signing --title "Meu PC - assinatura"
```

Pelo site, o passo 3 é: *Settings → SSH and GPG keys → New SSH key* → em *Key type*, **Signing Key**. Uma chave cadastrada só como *Authentication* não serve para assinar.

Confira: faça um commit e rode `git log --show-signature -1`. Depois do push, o commit deve aparecer como **Verified** no GitHub.

- O e-mail do commit (`git config user.email`) precisa ser um e-mail **verificado na sua conta do GitHub**. Se for outro, o commit aparece como *Unverified* e o push é recusado.
- Se o push for recusado por um commit antigo sem assinatura, assine de novo os commits da sua branch com `git rebase --exec "git commit --amend --no-edit -S" main` e suba com `git push --force-with-lease`.
- Os merges feitos pelo botão do PR ("Squash and merge") o próprio GitHub assina.

## O que acontece depois do merge

O pipeline (`.github/workflows/ci-cd.yml`) roda em todo PR e em todo push na `main`:

1. **Testes** (PR e `main`): tipos do servidor, build do cliente, imagem Docker e o E2E com dois navegadores.
2. **Deploy** (só na `main`): se os testes passarem, o projeto vai para a VPS e o site é atualizado em ~1 minuto.

Se os testes falharem na `main`, nada vai para produção: corrija com um novo PR. Acompanhe em **Actions** no GitHub ou com `gh run watch`.

Mudanças em `desktop/` também disparam o `desktop.yml`, que gera um instalador novo para Windows. Os apps instalados se atualizam sozinhos.

## Issues

Todo trabalho começa numa issue: bug, ideia ou investigação. Assim ninguém faz a mesma coisa duas vezes, e fica registrado o porquê de cada mudança.

### Criando uma issue

1. **Procure antes** se já existe uma issue sobre o assunto (abertas e fechadas). Se existir, comente nela em vez de abrir outra.
2. Use o **formulário certo** em *New issue*: 🐞 Bug ou ✨ Ideia. Falha de segurança **não** vai em issue: veja o [SECURITY.md](SECURITY.md).
3. **Uma issue, um assunto.** Dois problemas diferentes viram duas issues.
4. Título curto e específico, em português: "Ícones de mutado e ensurdecido não aparecem juntos", não "bug no áudio".
5. No corpo, siga o formato:
   - **Relato:** o que aconteceu, onde (web ou desktop) e como repetir. Print ou vídeo ajudam muito.
   - **Causa encontrada** (se souber): arquivo e linha.
   - **Onde mexer / possíveis correções.**
   - **Próximo passo:** o que falta confirmar.
6. Para problemas de **desempenho ou rede**, anexe uma **gravação de diagnóstico**: Configurações → Modo desenvolvedor → janela de diagnóstico → **Gravar**. Use "Marcar momento" quando o problema acontecer e anexe o `.json` salvo.

### Ciclo de vida

```
aberta ──► triagem ──► pronta ──► em andamento ──► PR aberto ──► fechada
             │                         │
             ├─► precisa de info       └─► (PR com "Closes #N" fecha sozinho no merge)
             └─► duplicada / não vamos fazer ──► fechada com explicação
```

1. **Aberta:** toda issue nova recebe a label `triagem`.
2. **Triagem** (um mantenedor, em até alguns dias):
   - confirma que é real e não é duplicada;
   - troca `triagem` pelas labels de tipo, área e prioridade;
   - se faltar informação, marca `precisa de info` e pergunta. Sem resposta em 14 dias, a issue é fechada (dá para reabrir quando a informação chegar).
3. **Pronta:** está clara o suficiente para alguém pegar. As mais simples ganham `good first issue`.
4. **Em andamento:** **antes de começar, atribua a issue a você** (*Assignees*) e marque `em andamento`. Se a issue já tem dono, combine nos comentários antes de mexer.
5. **PR aberto:** a branch e o PR citam a issue (`fix/6-mute-icons`, `Closes #6` na descrição).
6. **Fechada:** fecha sozinha quando o PR com `Closes #N` entra na `main`. Se for fechada sem PR (duplicada, não vamos fazer, não deu para reproduzir), o comentário final explica o motivo.

Desistiu de uma issue que pegou? Tire a atribuição e deixe um comentário com o que descobriu até ali. Isso economiza o tempo de quem pegar depois.

### Labels

| Grupo | Labels | Para quê |
|---|---|---|
| Tipo | `bug`, `enhancement`, `documentation`, `performance` | O que é |
| Área | `área: cliente`, `área: servidor`, `área: desktop`, `área: voz e vídeo`, `área: infra` | Onde mexe |
| Prioridade | `prioridade: alta`, `prioridade: média`, `prioridade: baixa` | Alta = quebra algo para muita gente ou é falha de segurança |
| Status | `triagem`, `precisa de info`, `em andamento` | Em que pé está |
| Fechamento | `duplicate`, `wontfix`, `invalid` | Por que fechou sem PR |
| Ajuda | `good first issue`, `help wanted` | Boas para quem está chegando, ou que precisam de mais gente |

### Resolvendo

- A correção sai num **PR que cita a issue** (`Closes #N`). Se o PR resolve só parte, use `Refs #N` e deixe a issue aberta.
- Se descobrir no caminho que a causa era outra, **atualize a issue** com o que achou. Ela é o registro da investigação.
- Depois do deploy, confira em produção (concord-community.com) e, se a issue veio de um relato de alguém, avise a pessoa.

## Segredos

Nunca suba `.env`, chaves ou senhas. Em produção, os segredos ficam no `.env` da VPS e nos *secrets* do repositório (`gh secret set NOME`). O CI os entrega à VPS sem que apareçam em log. O README explica cada variável.

## Fim de linha

O repositório usa LF (`.gitattributes`). No Windows, o Git converte sozinho. Só não force CRLF nos arquivos do projeto.
