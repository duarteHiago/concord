# Imagem de prévia dos links

`client/public/og.jpg` (1200x630) é a imagem que aparece quando alguém compartilha um link do Concord
no X, WhatsApp, Discord, Telegram etc. As tags `og:*` e `twitter:card` ficam no `<head>` de
`client/index.html` e das páginas em `client/public/*/index.html`.

Para mudar a arte: edite `og.html`, abra no Chrome com a janela em 1200x630 (ou DevTools > modo
responsivo 1200x630) e capture a tela. Exemplo com Playwright:

```sh
npx playwright screenshot --viewport-size=1200,630 --wait-for-timeout=1000 \
  "file://$PWD/tools/og-image/og.html" /tmp/og.png
```

Salve como JPG (qualidade ~88, abaixo de 300 KB para o WhatsApp mostrar) em `client/public/og.jpg`.
O X guarda a prévia em cache por alguns dias: para ver a nova na hora, compartilhe com `?v=2` no fim do link.
