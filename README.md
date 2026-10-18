# Concord

App de transmissão de tela a **60 fps** no estilo Discord: servidores, salas de voz, chat em tempo real, cargos e permissões. Você hospeda tudo.

## Funcionalidades

- **Transmissão de tela, janela ou aba**: 720p, 1080p, 1440p ou resolução nativa (até 4K) a 60 fps, com áudio do sistema/aba, modo *Fluidez* (jogos) ou *Nitidez* (texto) e codec H.264 (GPU), VP9, AV1 ou VP8.
- **Vários espectadores sem pesar seu upload**: o LiveKit (SFU) repassa o vídeo e usa simulcast, então quem tem conexão fraca recebe uma camada 720p.
- **Assistir sob demanda**, como no Discord: só baixa o vídeo de quem você clicar em "Assistir". Tem modo foco, tela cheia, volume da transmissão e estatísticas ao vivo (fps, resolução, Mbps, codec).
- **Voz**: microfone, ensurdecer, câmera, indicador de quem está falando, volume por pessoa, supressão de ruído, escolha de dispositivos e sons de entrada e saída.
- **Servidores e convites**: link com validade e limite de usos.
- **Canais de texto**: mensagens em tempo real, edição, exclusão, "digitando…", links e prévia de imagens.
- **Cargos e permissões em bits**: hierarquia, cor, exibição separada e sobrescritas por canal (permitir / herdar / negar). Também dá para criar canais privados.
- **Moderação**: silenciar na sala, encerrar transmissão, desconectar da sala e expulsar, respeitando a hierarquia de cargos.

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

## Hospedar na VPS

1. Aponte um domínio (registro **A**) para o IP da VPS.
2. Envie o projeto para a VPS (git ou scp) e rode:
   ```bash
   sudo ./deploy/setup.sh
   ```
   O script instala o Docker, gera os segredos no `.env`, libera as portas no `ufw` e sobe tudo.
3. Se o provedor tiver firewall no painel, libere as portas **80/tcp, 443/tcp, 7881/tcp e 7882/udp**.
4. Depois de criar as contas, coloque `ALLOW_REGISTRATION=false` no `.env` e rode `docker compose up -d` para fechar o cadastro.

Atualizar: `git pull && docker compose up -d --build`. Os dados ficam em `./data/concord.db`; para backup, basta copiar esse arquivo.

### Dimensionamento

Cada espectador de uma transmissão 1080p60 recebe cerca de 6 a 9 Mbps **saindo da VPS**. Por exemplo, 5 pessoas assistindo usam uns 45 Mbps de upload da VPS. A CPU quase não pesa, porque o LiveKit não recodifica o vídeo.

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
