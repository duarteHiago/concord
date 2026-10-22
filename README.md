# Concord

App de transmissão de tela a **60 fps** no estilo Discord: servidores, salas de voz, chat em tempo real, cargos e permissões. Você hospeda tudo.

## Funcionalidades

- **Transmissão de tela, janela ou aba**: 720p, 1080p, 1440p ou resolução nativa (até 4K) a 60 fps, com áudio do sistema/aba, modo *Fluidez* (jogos) ou *Nitidez* (texto) e codec H.264 (GPU), VP9, AV1 ou VP8.
- **Vários espectadores sem pesar seu upload**: o LiveKit (SFU) repassa o vídeo e usa simulcast, então quem tem conexão fraca recebe uma camada 720p.
- **Assistir sob demanda**, como no Discord: só baixa o vídeo de quem você clicar em "Assistir". Tem modo foco, tela cheia, volume da transmissão e estatísticas ao vivo (fps, resolução, Mbps, codec).
- **Voz**: microfone, ensurdecer, câmera, indicador de quem está falando, volume por pessoa, supressão de ruído, escolha de dispositivos e sons de entrada e saída.
- **Servidores e convites**: link com validade e limite de usos.
- **Canais de texto**: mensagens em tempo real, edição, exclusão, "digitando…", links e prévia de imagens.
- **Fóruns**: canais onde cada assunto vira um post com título, etiqueta (ideia, bug, feedback, pergunta), votos (+1) e respostas. A moderação marca o status (em análise, planejado, em andamento, feito, não vai rolar), fixa e tranca posts, e quem postou é avisado. Dá para ordenar por em alta, mais votados, recentes ou com atividade.
- **Modelo "Comunidade"**: ao criar um servidor, já vem com #anúncios e #boas-vindas (só a moderação escreve), os fóruns ideias, bugs, feedback e ajuda, chat e salas de voz.
- **Cargos e permissões em bits**: hierarquia, cor, exibição separada e sobrescritas por canal (permitir / herdar / negar). Também dá para criar canais privados.
- **Moderação**: silenciar na sala, encerrar transmissão, desconectar da sala e expulsar, respeitando a hierarquia de cargos.

## App desktop (Windows)

A pasta [desktop/](desktop/) tem o Concord para Windows, feito em Electron. Ele abre o mesmo servidor do site e acrescenta o que o navegador não consegue fazer:

- **Áudio da transmissão sem retorno de voz.** No navegador, o "áudio do sistema" captura tudo o que sai no PC, inclusive as vozes da sala, e quem assiste ouve a própria voz de volta. O app usa a captura **por processo** do Windows (WASAPI *process loopback*, a mesma técnica do Discord), com o capturador nativo [audio-capture.cpp](desktop/native/audio-capture.cpp):
  - ao transmitir a **tela**: todo o som do PC, **menos o do próprio Concord**;
  - ao transmitir uma **janela**: **só o som daquele programa** (por exemplo, só o jogo).
- **Seletor próprio** de telas e janelas, com miniaturas.

O áudio sem retorno exige **Windows 11**, ou Windows 10 a partir do build 20348.

O workflow [desktop.yml](.github/workflows/desktop.yml) compila o capturador, gera o instalador e o publica em `https://SEU-DOMINIO/downloads/Concord-Setup.exe`. No site aparece um botão de download na barra da esquerda. O instalador não é assinado digitalmente, então o Windows pode exibir o aviso do SmartScreen: clique em "Mais informações" e depois em "Executar assim mesmo".

## Na sala de voz

- **Mesa de sons:** cada servidor tem até 50 sons (MP3, OGG, WAV ou WEBM, até 15 segundos). Quem está na sala toca para todos ouvirem. Também dá para usar `/sound nome` no chat.
- **Efeitos de voz:** voz grossa, esquilo, robô, rádio, megafone, eco e caverna, aplicados no seu microfone.
- **Zoom na transmissão:** a rolagem do mouse aproxima onde está o cursor, e arrastar move a imagem.
- **Janela separada:** a live abre em outra janela, para levar a outro monitor e pôr em tela cheia.
- **Painel lateral** com o chat da sala e a lista de membros.

## Mais na sala e no chat

- **Reações flutuantes:** escolha um emoji no botão de coração e clique na tela. Uma rajada sobe a partir do ponto clicado, para todos da sala.
- **Minigames:** roleta, dado e cara ou coroa, pelo botão **+** do chat ou por `/roleta a, b, c`, `/dado 2d6` e `/moeda`. O servidor sorteia o resultado, então todo mundo vê a mesma roleta parar no mesmo lugar.
- **Mensagens privadas:** pelo botão de balão no topo da barra de servidores, ou por "Mensagem" no perfil de alguém de um servidor em comum.
- **Supressão de ruído por IA:** GTCRN (padrão, "IA natural": melhor preservação da voz nos testes com voz real), [DeepFilterNet 3](https://github.com/Rikorose/DeepFilterNet) ("IA máxima", com controle de intensidade; servido pelo próprio Concord) ou RNNoise, todas rodando no seu PC. Opcionais: portão de voz (sensibilidade automática ou manual, com medidor) e nivelador de volume depois da limpeza.
- **Trocar microfone, saída e câmera** pela setinha ao lado de cada ícone, na barra de baixo.
- **Atalhos de teclado** configuráveis em Configurações → Atalhos. Ctrl+K abre a busca rápida. No app desktop, silenciar e ensurdecer funcionam com o app em segundo plano.

## Comandos no chat

Digite `/` no campo de mensagem para ver a lista. Os comandos são `/nudge`, `/all`, `/me`, `/shrug`, `/sound`, `/nick`, `/status`, `/dnd`, `/online`, `/leave` e, para moderação, `/mute`, `/unmute`, `/disconnect` e `/kick`. Menções funcionam com `@usuario`, e `@todos` exige a permissão "Mencionar todos". Quem é mencionado recebe som e notificação.

## Atividades

O app desktop mostra para os outros **o jogo que você está jogando pela Steam** e **a música tocando no Spotify**, sem precisar de login: ele lê o registro da Steam e o título da janela do Spotify. Isso pode ser desligado em Configurações → Perfil. No site, dá para definir um **status personalizado**.

## Bots

Crie bots em **Configurações → Bots** e controle-os pela API com um token. Veja o guia em [docs/bots.md](docs/bots.md) e o exemplo pronto em [examples/bot](examples/bot).

## Esqueci minha senha

As contas não usam e-mail. Ao criar a conta, a pessoa recebe um **código de recuperação**, que aparece uma única vez. Com ele, dá para criar uma senha nova pela tela de login, em "Esqueci minha senha". Depois de usado, o código é trocado por outro. Também dá para gerar um código novo em Configurações → Conta. Se o código se perder, quem hospeda o Concord pode gerar uma senha temporária:

```bash
docker compose exec app node src/cli.ts reset-password <usuário>
docker compose exec app node src/cli.ts users   # lista as contas
```

## Chamar atenção

Inspirado no MSN. No perfil de alguém, o botão **Chamar atenção** faz a tela da pessoa tremer (no app desktop, a janela chacoalha), toca um som e mostra uma notificação do Windows. Para quem recebe, aparece um cartão com **"Ir até lá"** e **"Chamar de volta"**.

Para não incomodar:
- o status **Não perturbe** bloqueia os chamados, e quem tentou chamar é avisado;
- o **sininho** no perfil de uma pessoa silencia só ela, sem que ela saiba;
- dá para desligar a tremida, o som e a notificação separadamente, em Configurações → Notificações;
- cada pessoa só pode chamar a mesma pessoa uma vez a cada 15 segundos.

## Personalização

- **Perfil:** foto, cor do banner, "sobre mim" e **apelido por servidor**.
- **Aparência:** 7 temas, cor de destaque, **imagem de fundo** (com desfoque e escurecimento), tamanho da interface e **CSS personalizado**. Tudo fica salvo no perfil, então vale no navegador e no app desktop.
- **Servidor:** ícone com imagem, além dos cargos, cores e permissões.

Um tema é um conjunto de variáveis CSS (`--color-surface-0…4`, `--color-fg`, `--color-accent`…). Os temas prontos ficam em [client/src/lib/theme.ts](client/src/lib/theme.ts). Para criar um novo, basta adicionar outro item ali.

## Arquitetura

| Parte | Tecnologia |
|---|---|
| `client/` | React 19 + Vite + Tailwind 4 + `livekit-client` |
| `server/` | Node 24 (TypeScript nativo) + Express 5 + Socket.io + SQLite (`node:sqlite`) |
| `shared/` | Permissões compartilhadas entre cliente e servidor |
| Mídia | LiveKit Server (SFU WebRTC) |
| Deploy | Docker Compose + Caddy (HTTPS automático) |

## Testar localmente

Pré-requisito: Docker Desktop.

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

Abra http://localhost:3000, crie uma conta e um servidor. Para simular outra pessoa, use uma janela anônima e entre pelo convite.

Vai contribuir? Veja o [guia de contribuição](CONTRIBUTING.md): desenvolvimento com recarga automática, convenções, checklist antes de subir e como funcionam o CI e o deploy.

## Hospedar na VPS

1. Aponte um domínio (registro **A**) para o IP da VPS.
2. Envie o projeto para a VPS (git ou scp) e rode:
   ```bash
   sudo ./deploy/setup.sh
   ```
   O script instala o Docker, gera os segredos no `.env`, libera as portas no `ufw` e sobe tudo.
3. Se o provedor tiver firewall no painel, libere as portas **80/tcp, 443/tcp, 7881/tcp e 7882/udp**.
4. Depois de criar as contas, coloque `ALLOW_REGISTRATION=false` no `.env` e rode `docker compose up -d` para fechar o cadastro.

**Servidor oficial da comunidade (opcional):** crie um servidor com o modelo "Comunidade", gere um convite que **nunca expira** e coloque o código em `COMMUNITY_INVITE=` no `.env` (ou na variável `COMMUNITY_INVITE` do repositório, para o CI/CD). O app passa a mostrar "Entrar na comunidade" para todo mundo, e a landing page ganha o botão.

**Selo de verificado (opcional):** escolha um servidor para ser a autoridade da instalação e coloque o `id` dele em `AUTHORITY_SERVER_ID=` no `.env`. Quem tiver o cargo **Administrador** nesse servidor passa a poder marcar qualquer servidor ou pessoa (de qualquer servidor, não só o próprio) como verificado, em Configurações do servidor → Visão geral, ou no perfil de alguém. Sem essa variável, a função fica desligada.

**Recuperar a senha por e-mail (opcional):** crie uma conta no [Brevo](https://www.brevo.com), autentique o domínio (registros DKIM, DMARC e de verificação no DNS, em *Senders, Domains & Dedicated IPs → Domains*) e gere uma chave em *SMTP & API → API Keys*. No `.env`, coloque `BREVO_API_KEY=` e `MAIL_FROM=` (remetente no domínio autenticado, por exemplo `nao-responda@seudominio.com`). Pelo CI/CD: `gh secret set BREVO_API_KEY` e `gh variable set MAIL_FROM -b nao-responda@seudominio.com`. A pessoa cadastra o e-mail em Configurações → Conta (só vale depois do clique no link de confirmação) e passa a receber um link em "Esqueci minha senha". O e-mail é opcional: o código de recuperação continua funcionando. Sem a chave, a função não aparece no app.

Atualizar: `git pull && docker compose up -d --build`. Os dados ficam em `./data/concord.db`; para backup, basta copiar esse arquivo.

### Dimensionamento

Cada espectador de uma transmissão 1080p60 recebe cerca de 6 a 9 Mbps **saindo da VPS**. Por exemplo, 5 pessoas assistindo usam uns 45 Mbps de upload da VPS. A CPU quase não pesa, porque o LiveKit não recodifica o vídeo.

## Monitoramento (Grafana)

O deploy sobe junto um monitoramento ao vivo em `https://SEU_DOMINIO/grafana` (usuário `admin`; a senha é gerada na VPS e fica no `.env`: `grep GRAFANA_ADMIN_PASSWORD /opt/concord/.env`).

- **Visão geral**: site no ar visto de fora, latência, online, em voz, transmissões, requisições/s, erros, CPU/RAM/disco.
- **VPS**: CPU por núcleo e por tipo, carga, memória, swap, disco (uso, leitura/escrita), rede, conexões.
- **Containers**: CPU, memória, disco e reinícios de cada container da VPS.
- **App e rede**: rotas da API (req/s e p95), eventos (mensagens, logins, uploads...), Socket.io, salas de voz, Node.js (event loop, heap), Caddy, túnel da Cloudflare, ping e disponibilidade.
- **Gargalos (teste de carga)**: para cada recurso, quanto está em uso e quanto tem processo *esperando* por ele (pressão do kernel), mais os sinais que deveriam ficar em zero (swap, OOM, UDP descartado, retransmissão TCP, perda de mídia). Mostra carga aplicada x tempo de resposta, disco (IOPS, latência, fila), rede contra a banda da VPS (escolha a banda no topo do painel), pacotes por segundo, conntrack e o LiveKit por dentro (salas, faixas, perda, NACK, RTT, jitter).

Para marcar um teste de carga nos gráficos, na VPS:

```bash
./deploy/monitoring/marcar.sh inicio "50 pessoas em voz"   # abre uma faixa sombreada
./deploy/monitoring/marcar.sh "subi para 100"              # marca um instante
./deploy/monitoring/marcar.sh fim                          # fecha a faixa
```

Para saber **o que no código** não aguenta a carga, o painel Gargalos tem a seção "Onde o app gasta o tempo": quanto cada consulta ao banco, evento do Socket.io e rota segura o servidor (o SQLite é síncrono, então uma consulta lenta trava todo mundo). O que passar de `SLOW_MS` (padrão 100 ms) vai para o log com o nome exato: `docker compose logs app | grep lento`. E, com a carga rodando, um perfil de CPU mostra função por função onde o tempo vai e quanto a thread do app ficou livre (folga):

```bash
./deploy/monitoring/perfil.sh 30   # resumo na tela; o .cpuprofile completo fica em data/perfis/
```

Coleta: Prometheus (a cada 10 s, guarda 15 dias), node-exporter, um coletor próprio do `docker stats` (`deploy/monitoring/docker-exporter.mjs`), blackbox (latência), as métricas do LiveKit (`127.0.0.1:16789`) e as do próprio app (`127.0.0.1:9464`). Tudo escuta só em `127.0.0.1`; o único acesso de fora é o Grafana, com login. Para desligar: `MONITORING=off ./deploy/setup.sh`. Os painéis são gerados por `python deploy/monitoring/dashboards.py`.

## Roadmap

Projetos planejados (com o contexto e as medições que levaram a eles) ficam em [docs/ROADMAP.md](docs/ROADMAP.md). O próximo grande: captura de tela nativa com NVENC, para transmitir jogos pesados a 60 fps.

## Observações

- Use Chrome ou Edge no PC para transmitir. Áudio do sistema funciona no Windows ao compartilhar a **tela inteira** ou uma **aba**; ao compartilhar uma janela só, o navegador não captura o áudio dela.
- Fora de `localhost`, o navegador exige HTTPS para capturar a tela (o Caddy já cuida disso).
- O nome de usuário é único. Quem cria o servidor é o dono e tem todas as permissões.

## CI/CD (GitHub Actions)

Todo push na branch `main` roda o pipeline [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml):

1. **Testes:** checagem de tipos do servidor, build do cliente, build da imagem Docker e um **teste E2E com dois navegadores Chrome**. O teste confere que um participante ouve o outro e que a transmissão de tela chega a quem clica em "Assistir".
2. **Deploy:** se os testes passarem, envia o projeto para a VPS por SSH, roda `deploy/setup.sh` e confere o `/health` no domínio.

Pull requests rodam só os testes.

**Configuração (uma vez):** `powershell -ExecutionPolicy Bypass -File .\deploy\setup-cicd.ps1`. O script cria uma chave SSH só para o deploy, instala essa chave na VPS e cadastra os secrets e as variáveis do repositório.

Para rodar o E2E localmente:

```bash
docker build -t concord-app:test . && docker compose -f tests/e2e/docker-compose.yml run --rm pw
```
