---
name: novidades
description: Escreve a nota de Novidades (release notes do app) de um PR do Concord, em client/src/releases/. Use sempre que um PR muda algo que quem usa o app vê ou sente (recurso novo, mudança de comportamento, conserto que alguém notava), antes de abrir o PR ou ao terminar a mudança. Também quando pedirem "release notes", "novidades", "changelog" ou "o que mudou".
---

# Nota de Novidades de um PR

Cada PR com mudança visível leva **a sua própria nota** no mesmo PR: um arquivo em
`client/src/releases/AAAA-MM-DD-HHMM-assunto.tsx`. A página "Novidades" (ícone de jornal na fileira de
servidores) junta as notas do mesmo dia numa edição, e a apresentação abre sozinha uma vez para quem
ainda não viu. Uma nota por PR evita conflito quando duas pessoas sobem coisas no mesmo dia.

## Precisa de nota?

Sim, quando quem **usa o app** percebe a mudança:
- recurso novo ou mudança de comportamento (`feat`);
- conserto de algo que as pessoas notavam (`fix`): "a voz picotava", "o código do 2FA não passava".

Não, quando é só interno. Nesse caso o PR leva o rótulo `sem-novidade` (`gh pr edit <n> --add-label sem-novidade`):
- dependências, CI, deploy, monitoramento, testes, refatoração, documentação do repositório;
- o portal da equipe (`/admin`) e outras coisas que só a equipe vê;
- ajuste tão pequeno que ninguém notaria (um ícone trocado, um espaçamento).

Na dúvida, escreva a nota: uma linha em "Também chegou" custa pouco.

## Passo a passo

1. Crie o rascunho (dentro de `client/`): `npm run release:draft <assunto>`. Ele cria o arquivo com o `id` na
   hora de Brasília (`AAAA-MM-DD-HHMM`) e lista em comentário os commits da branch. Sem Node, crie o arquivo à
   mão com o mesmo formato de nome e `id`.
   - O `id` tem que ser **maior que o de todas as notas que já estão na `main`**, e igual ao começo do nome
     do arquivo. Quem já viu a nota mais nova fica marcado como "visto até ela" e nunca veria uma nota com id
     menor. Se outra nota entrou na `main` depois que você criou a sua, renomeie a sua para depois dela. O
     `release:draft` e o CI conferem isso.
2. Decida o nível de cada mudança:
   - **`highlights`** (destaque): muda como a pessoa usa o app. Ganha um passo na apresentação, com arte, texto
     e, se der, `action` (abre o recurso) e/ou `spotlight` (aponta o botão de verdade). No máximo 2 por nota.
   - **`also`** (também chegou): melhoria visível que não precisa de explicação. Uma frase.
   - **`fixes`** (consertamos): uma frase do ponto de vista de quem sofria com o problema.
3. Escreva os textos (regras abaixo).
4. Faça a arte de cada destaque (abaixo).
5. Apague os comentários do rascunho e confira que o build do client passa (`npm run build` em `client/`, ou o CI).

Exemplos completos: `client/src/releases/2026-10-21.tsx` e `2026-10-23.tsx`.

## Como escrever

- Português do Brasil, falando com a pessoa ("você"), tom de conversa. Nada de termo técnico: "a tela vai
  mais leve", não "codec H.265"; "o código do app autenticador", não "TOTP".
- `title` da nota: curto, o assunto ("Verificação em duas etapas"). Vira o título da edição na página.
- `kicker`: a área do app, uma palavra ("Chat", "Voz", "Transmissão", "Conta", "Ajuda").
- `title` do destaque: o que a pessoa ganha ("Proteja sua conta com um código do celular").
- `text`: 1 a 3 frases. O que é, como usa, e onde fica se não tiver `spotlight`.
- `fixes`: comece pelo sintoma que a pessoa via. "O código do 2FA passa mesmo com o relógio do celular
  adiantado", não "fix totp drift".
- Sem emoji, sem exclamação em toda frase, sem "agora você pode" em tudo.

## Arte

A arte é uma "foto" do recurso desenhada com os tokens do tema (assim acompanha o tema da pessoa), feita com
`Frame`, `Tag` e `Spot` de `client/src/components/modals/OnboardingArt.tsx`:

```tsx
function MinhaArte() {
  return (
    <Frame className="h-[170px]">
      {/* um pedaço da interface, simplificado: barras, botões, avatares (bg-surface-*, bg-accent...) */}
      <Tag className="right-3 bottom-3">O que olhar aqui</Tag>
    </Frame>
  );
}
```

Pode usar componentes reais do app quando ajudam (a nota de 23/10 usa o `SupporterPatch` de verdade).

## Ação e spotlight

- `action: { label, run }` leva direto ao recurso. Exemplos: `useApp.getState().openModal({ type: 'userSettings', tab: 'account' })`,
  `useApp.getState().openModal({ type: 'support' })`, `openDiagnosticsWindow()`.
- `spotlight: { target, title, tip, fallback }` aponta um botão que tenha `data-tour="<target>"`. Se o botão
  ainda não tem, acrescente o atributo nele no mesmo PR. `fallback` é a frase mostrada quando o botão não está
  na tela ("Abra um canal de texto: o botão fica ao lado do campo de mensagem.").

## Checagem no CI

O job "Novidades" falha em PR com título `feat` ou `fix` que não mexe em `client/src/releases/` e não tem o
rótulo `sem-novidade`. Não faça merge com ele vermelho: escreva a nota ou ponha o rótulo, se for interno de
verdade.
