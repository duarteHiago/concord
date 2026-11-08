# Concord de testes (homologação)

Uma cópia do Concord numa VPS separada, para testar mudanças antes da produção. Ela não divide nada com a
produção: tem banco, LiveKit e túnel próprios, e não consome recursos da VPS de produção.

**Como reconhecer:** a logo é verde-água com o balão amarelo, a tela tem uma borda verde com a etiqueta
"Ambiente de testes", a aba aparece como "[TESTE] Concord" e o app instalado se chama "Concord teste".

**Quem entra:** só quem está em `STAGING_USERS` ou em `STAGING_ADMIN_USERS`, por nome de usuário. O resto não
consegue nem criar conta, nem entrar, nem receber e-mail. Quem sai da lista perde as sessões abertas no
próximo pedido.

## Como funciona

- Todo push na branch `staging` roda os testes e faz o deploy no Concord de testes (job "Deploy no Concord
  de testes" em `.github/workflows/ci-cd.yml`). A produção continua saindo só da `main`.
- A instalação fica em `/opt/concord-staging`, com o túnel da Cloudflare `concord-teste`.
- O build sai com `STAGING=true`, que:
  - troca logo e ícones pelos de `client/staging/public/` (gerados por `client/scripts/staging-brand.py`);
  - põe a faixa "Ambiente de testes" no app e pula a landing page;
  - tira o site dos buscadores (`robots.txt` e `X-Robots-Tag`);
  - libera a entrada só para `STAGING_USERS` e `ADMIN_USERS`.
- O login com Google e o e-mail (Brevo) são os mesmos da produção. O captcha fica desligado (a chave é presa
  ao domínio da produção) e os backups ficam só no disco da VPS. O bucket de backups é o da produção, e
  usá-lo aqui misturaria e apagaria os backups de verdade.
- **Não copie o banco da produção para cá.** São dados de pessoas que não autorizaram esse uso (LGPD).
  Crie contas de teste.

## Configurar pela primeira vez

1. **A VPS precisa estar livre.** Se ainda roda uma instalação antiga do Concord, pare-a antes (por SSH:
   `cd /opt/concord && docker compose down`). O teste usa as mesmas portas (3000, 7880, 7881, 7882/udp e as do
   monitoramento).
2. **Login da Cloudflare na VPS** (uma vez, se a VPS nunca entrou): por SSH, rode `cloudflared tunnel login` e
   abra o link. O CI não faz isso sozinho, para o link não aparecer no log público.
3. **Variáveis e chave do CI** (no seu PC, na raiz do projeto):

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\deploy\setup-cicd.ps1 -Staging -VpsHost IP_DA_VPS -Domain teste.seudominio.com -Users "seu_usuario,amigo"
   ```

   Esse comando cria só variáveis e secrets `STAGING_*`. Os da produção ficam como estão.
4. **Google:** no Google Cloud Console, no cliente OAuth do Concord, acrescente
   `https://teste.seudominio.com/api/auth/google/callback` nas URIs de redirecionamento autorizadas.
5. **Primeiro deploy:** `git push origin main:staging`.

## Testar uma branch

```bash
git push --force origin minha-branch:staging
```

Cada push substitui o que estava no ar. Para voltar ao estado da produção: `git push --force origin main:staging`.

## Mudar quem entra

No GitHub, em Settings → Secrets and variables → Actions → Variables, edite `STAGING_USERS`. Vale a partir
do próximo deploy.

**Portal `/admin` do teste:** primeiro crie a sua conta no teste e só depois ponha o nome em
`STAGING_ADMIN_USERS`. Como na produção, nome que está na lista de admins e ainda não tem conta fica reservado,
e ninguém consegue criá-la, nem você.

## Variáveis

| Variável | Para quê |
|---|---|
| `STAGING_VPS_HOST`, `STAGING_VPS_USER` | Acesso SSH à VPS de testes |
| `STAGING_DOMAIN` | Domínio do teste (ex.: `teste.seudominio.com`) |
| `STAGING_DEPLOY_MODE` | `tunnel` (padrão) ou `direct` |
| `STAGING_USERS` | Quem pode entrar (nomes de usuário, separados por vírgula) |
| `STAGING_ADMIN_USERS` | Quem entra no portal `/admin` do teste |
| `STAGING_FIREWALL` | `off` se a VPS já tem outros serviços e você cuida do firewall à mão |
| Secrets `STAGING_VPS_SSH_KEY`, `STAGING_VPS_KNOWN_HOSTS` | Chave do deploy e identificação da VPS |
