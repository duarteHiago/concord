# Bots no Concord

Um bot é uma conta controlada por um programa seu. Ele recebe as mensagens em tempo real e responde pela mesma API que o app usa.

## 1. Criar o bot

1. No Concord, abra **Configurações → Bots** e clique em **Criar bot**.
2. **Copie o token**, que começa com `cb_`. Ele aparece uma única vez. Se perder, gere outro com **Novo token**.
3. Em **Adicionar a um servidor**, escolha o servidor. Você precisa da permissão "Gerenciar servidor" nele.

> O token é a senha do bot. Não publique no GitHub nem cole em lugar público. Prefira guardá-lo numa variável de ambiente.

## 2. Rodar o exemplo

A pasta [examples/bot](../examples/bot) tem um bot pronto, que responde `!ping`, `!dado` e `!ajuda`:

```bash
cd examples/bot
npm install
CONCORD_URL=https://seu-concord.com CONCORD_TOKEN=cb_seu_token node bot.mjs
```

No Windows (PowerShell):

```powershell
$env:CONCORD_URL="https://seu-concord.com"; $env:CONCORD_TOKEN="cb_seu_token"; node bot.mjs
```

## 3. Autenticação

| Onde | Como |
|---|---|
| API HTTP | cabeçalho `Authorization: Bot <token>` |
| Tempo real (Socket.IO, caminho `/socket.io`) | `io(URL, { auth: { token: '<token>' } })` |

## 4. Eventos em tempo real

Depois de conectado, o bot recebe os eventos dos servidores onde está:

| Evento | Quando | Dados |
|---|---|---|
| `message:new` | nova mensagem num canal que o bot vê | `{ id, channelId, content, createdAt, author: { id, username, displayName, bot } }` |
| `message:update` | mensagem editada | igual ao `message:new` |
| `message:delete` | mensagem apagada | `{ id, channelId }` |
| `mention` | alguém mencionou o bot (`@usuario_do_bot`) | `{ message, serverId, serverName, channelName }` |
| `server:changed` | canais, cargos ou membros mudaram | `{ serverId }` |
| `presence` | alguém entrou, saiu ou mudou de status | `{ userId, online, status, activity }` |
| `voice:states` | quem está em cada sala de voz | `{ serverId, states: [...] }` |

## 5. Rotas mais úteis

Todas ficam em `/api` e usam o cabeçalho `Authorization: Bot <token>`.

| Método e rota | O que faz |
|---|---|
| `GET /me` | dados do próprio bot |
| `GET /servers` | servidores onde o bot está |
| `GET /servers/:id` | canais, cargos e membros de um servidor |
| `GET /channels/:id/messages?limit=50` | últimas mensagens de um canal |
| `POST /channels/:id/messages` `{ content }` | envia mensagem (até 2000 caracteres) |
| `PATCH /messages/:id` `{ content }` | edita uma mensagem do bot |
| `DELETE /messages/:id` | apaga uma mensagem (do bot, ou de outros se o cargo do bot permitir) |
| `POST /servers/:id/members/:userId/nudge` | chama a atenção de alguém |

O bot segue as **permissões dos cargos**, como qualquer membro. Para ele moderar, dê a ele um cargo com essas permissões. Bots não entram em salas de voz e não podem criar servidores nem aceitar convites. Só o dono adiciona o bot a um servidor.
