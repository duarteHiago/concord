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
- **Login:** usuário e senha, **sem confirmar e-mail** (`REQUIRE_EMAIL=false`): a lista de acesso já barra quem
  não foi liberado, e assim dá para criar contas de teste sem uma caixa de e-mail para cada uma. O e-mail (o
  mesmo Brevo da produção) continua servindo para "Esqueci minha senha". O login com Google fica
  desligado: o cliente OAuth da produção tem a marca verificada presa ao domínio dela, e mexer nisso pode
  pedir uma nova verificação. Para ter Google no teste, crie um projeto separado no Google Cloud em modo
  "Teste" (sem verificação; só as contas Google listadas lá entram), com a URI
  `https://DOMINIO_DO_TESTE/api/auth/google/callback`, e preencha a variável `STAGING_GOOGLE_CLIENT_ID` e o
  secret `STAGING_GOOGLE_CLIENT_SECRET`.
- O captcha fica desligado (a chave é presa ao domínio da produção) e os backups ficam só no disco da VPS.
  O bucket de backups é o da produção, e usá-lo aqui misturaria e apagaria os backups de verdade.
- **Domínio:** precisa estar na mesma conta da Cloudflare que o túnel da VPS (o login de `cloudflared` dela).
  Um CNAME de outra conta para o túnel dá o erro 1033.
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
4. **Primeiro deploy:** `git push origin main:staging`.

## Testar uma branch

```bash
git push --force origin minha-branch:staging
```

Cada push substitui o que estava no ar. Para voltar ao estado da produção: `git push --force origin main:staging`.

## Mudar quem entra

A lista é um **secret** do environment `staging`, e não uma variável: o repositório é público, e o log do
deploy mostraria os nomes. Aí alguém poderia criar a conta com o nome de quem ainda não se cadastrou.

```bash
gh secret set STAGING_USERS --env staging -b "voce,amigo"
gh workflow run ci-cd.yml --ref staging   # novo deploy, para valer
```

**Portal `/admin` do teste:** primeiro crie a sua conta no teste e só depois rode
`gh secret set STAGING_ADMIN_USERS --env staging -b "voce"`. Como na produção, nome que está na lista de admins
e ainda não tem conta fica reservado, e ninguém consegue criá-la, nem você.

## Segurança

- **Chave SSH própria** (`~/.ssh/concord_deploy_staging`): o teste roda código ainda não revisado, então a chave
  dele não pode abrir a produção. O `setup-cicd.ps1 -Staging` também tira a chave da produção desta VPS.
- **Secrets no environment `staging`**, que só aceita deploy da branch `staging`: workflow de outra branch não
  lê a chave.
- **E-mail:** crie uma chave da Brevo só para o teste e grave em `STAGING_BREVO_API_KEY` (no environment
  `staging`). Se vazar, você revoga sem parar o e-mail da produção. Enquanto ela não existir, o teste usa a da
  produção. A Brevo também precisa ter o IP da VPS do teste em Security → Authorised IPs.
- **A VPS é compartilhada** com outros sistemas. O app roda sem root, mas o ideal de longo prazo é o teste ter
  uma VPS só dele.

## Variáveis

| Variável | Para quê |
|---|---|
| `STAGING_VPS_HOST`, `STAGING_VPS_USER` | Acesso SSH à VPS de testes |
| `STAGING_DOMAIN` | Domínio do teste (ex.: `teste.seudominio.com`) |
| `STAGING_DEPLOY_MODE` | `tunnel` (padrão) ou `direct` |
| `STAGING_FIREWALL` | `off` se a VPS já tem outros serviços e você cuida do firewall à mão |
| `STAGING_GOOGLE_CLIENT_ID` | Opcional: cliente OAuth próprio do teste (com o secret `STAGING_GOOGLE_CLIENT_SECRET`) |

Secrets (no environment `staging`):

| Secret | Para quê |
|---|---|
| `STAGING_USERS` | Quem pode entrar (nomes de usuário, separados por vírgula) |
| `STAGING_ADMIN_USERS` | Quem entra no portal `/admin` do teste |
| `STAGING_VPS_SSH_KEY`, `STAGING_VPS_KNOWN_HOSTS` | Chave do deploy e identificação da VPS |
| `STAGING_BREVO_API_KEY` | Chave da Brevo só do teste (sem ela, usa a da produção) |

## Mecenato de cortesia

Testers entram no Mecenato sem apoiar por Pix. A lista é um **secret**, pelo mesmo motivo da lista de quem entra.
Ponha só quem **já tem conta**: nome da lista sem conta fica reservado e ninguém consegue se cadastrar com ele.

```bash
gh secret set STAGING_MECENATO_COURTESY --env staging -b "amigo1,amigo2"   # teste
gh secret set MECENATO_COURTESY --env production -b "amigo1,amigo2"        # produção
```

O portal `/admin` também libera e tira conta por conta (Contas → a pessoa → Mecenato de cortesia).
