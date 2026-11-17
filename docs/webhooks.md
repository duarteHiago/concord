# Webhooks no Concord

Um webhook é um endereço secreto que outro app usa para mandar mensagens num canal: alertas do Grafana,
avisos do Uptime Kuma, o resultado de um deploy, um script seu. Não precisa de conta nem de bot.

> Quer um programa que também **lê** mensagens e responde? Isso é um bot: veja [bots.md](bots.md).

## 1. Criar o webhook

1. Abra as configurações do canal (a engrenagem ao lado do nome) e vá em **Integrações**.
   Precisa da permissão "Gerenciar canais" e de poder mandar mensagens no canal.
2. Dê um nome (ele aparece como autor das mensagens) e clique em **Criar**.
3. **Copie o endereço.** Ele aparece uma vez só. Se perder ou vazar, use **Novo endereço**: o antigo para
   de funcionar na hora.

> Quem tem o endereço consegue mandar mensagens no canal. Guarde como uma senha.

Apagar o webhook não apaga as mensagens que ele já mandou.

## 2. Mandar uma mensagem

O corpo segue o formato de webhook do **Discord**. Ferramentas que já mandam para o Discord funcionam colando
o endereço do Concord no lugar.

```bash
curl -X POST "https://seu-concord.com/api/webhooks/ID/TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Deploy da versão 1.4 terminou"}'
```

Com cartão (alerta, incidente):

```json
{
  "username": "Grafana (produção)",
  "content": "@ana alerta disparado",
  "embeds": [
    {
      "title": "API de pagamentos com 40% de erro",
      "url": "https://grafana.exemplo.com/d/abc",
      "description": "Desde 14:02. Limite: 5%.",
      "color": 14687834,
      "fields": [
        { "name": "Serviço", "value": "pagamentos", "inline": true },
        { "name": "Região", "value": "sa-east-1", "inline": true }
      ],
      "footer": { "text": "Grafana" },
      "timestamp": "2026-11-19T14:02:00Z"
    }
  ]
}
```

| Campo | O que faz |
|---|---|
| `content` | texto da mensagem, até 2000 caracteres. `@usuario` avisa a pessoa |
| `username` | troca o nome do autor só nesta mensagem |
| `embeds` | até 10 cartões: `title`, `url`, `description`, `color` (número, `0xRRGGBB`), `author.name`, `fields` (até 25), `footer.text`, `timestamp` |

Sem `?wait=true` a resposta é `204` sem corpo. Com `?wait=true`, vem `{ id, channel_id, content }`.

### Imagens e arquivos

Mande como arquivo, em `multipart/form-data`, como no Discord: os campos da mensagem vão em `payload_json`
e os arquivos em qualquer outro campo (`files[0]`, `file`...). Até 10 arquivos, 20 MB cada e 25 MB somando tudo.

```bash
curl -X POST "https://seu-concord.com/api/webhooks/ID/TOKEN" \
  -F 'payload_json={"content": "Gráfico do incidente"}' \
  -F "files[0]=@grafico.png"
```

Os campos `embeds[].image`, `embeds[].thumbnail` e `avatar_url` (imagem por link) são **ignorados**. A foto
do webhook se troca nas configurações do canal. Um link de imagem escrito no texto (`content` ou
`description`) aparece como em qualquer mensagem do chat.

## 3. Formato do Slack

Para ferramentas que só falam com o Slack, acrescente `/slack` no fim do endereço:

```bash
curl -X POST "https://seu-concord.com/api/webhooks/ID/TOKEN/slack" \
  -H "Content-Type: application/json" \
  -d '{"text": "Site fora do ar: <https://status.exemplo.com|ver status>", "attachments": [{"color": "danger", "title": "exemplo.com", "text": "Timeout"}]}'
```

Aceita `text`, `username` e `attachments` (`color` em `#rrggbb` ou `good`/`warning`/`danger`, `title`,
`title_link`, `pretext`, `text`, `fields`, `footer`, `ts`). Os `blocks` não são lidos: o `text` serve de
resumo. A resposta é `ok`.

## 4. Ferramentas conhecidas

| Ferramenta | Como configurar |
|---|---|
| **Grafana** | Alerting → Contact points → tipo **Discord** → cole o endereço em "Webhook URL" |
| **Uptime Kuma** | Notificações → tipo **Discord** → cole o endereço em "Discord Webhook URL" |
| **GitHub Actions** | um passo com `curl` (exemplo acima), com o endereço guardado num *secret* do repositório |
| Outras com "Slack" | use o endereço com `/slack` no fim |

Os webhooks do próprio GitHub (Settings → Webhooks) mandam um formato só dele e ainda não são lidos.

## 5. Limites

- 30 mensagens por minuto por webhook. Passou disso, a resposta é `429` com `Retry-After`.
- 60 arquivos por hora por webhook.
- 10 webhooks por canal. Fóruns não recebem webhooks. Para criar, além de "Gerenciar canais" é preciso
  poder mandar mensagens no canal.
- Quando o app manda um `username`, o nome real do webhook aparece ao lado ("via Grafana").
- `@todos`/`@everyone` não avisa ninguém. `@usuario` avisa quem tem acesso ao canal.
- Muitas tentativas com token errado do mesmo endereço de IP bloqueiam esse IP por 10 minutos.
