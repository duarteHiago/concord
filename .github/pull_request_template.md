## O que muda

<!-- Resumo em poucas linhas: o problema, a causa e o que este PR faz. -->

Closes #

## Como testei

<!-- O que você rodou e conferiu na mão. Ex.: "duas contas na mesma call, mutei e ensurdeci, os dois ícones aparecem". -->

## Checklist

- [ ] Título no formato Conventional Commits (`fix(voice): ...`, `feat(chat): ...`)
- [ ] Commits assinados (aparecem como **Verified**)
- [ ] `server`: `npx tsc --noEmit` passa
- [ ] `client`: `npm run build` passa
- [ ] Testei o fluxo na mão (com duas contas, se envolve outra pessoa)
- [ ] Se guarda um dado novo das pessoas: atualizei `client/public/privacidade/`
- [ ] Se muda o banco: o servidor sobe com um banco novo (`addColumn` depois do `CREATE TABLE`)
- [ ] Se muda `.env` ou o deploy: atualizei o README e o `docker-compose.yml`
