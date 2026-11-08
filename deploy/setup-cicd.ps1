# Configura o deploy automático (GitHub Actions -> VPS). Rode UMA vez, na raiz do projeto:
#   powershell -ExecutionPolicy Bypass -File .\deploy\setup-cicd.ps1 -VpsHost IP -Domain concord.seudominio.com
# O que faz:
#   1. Cria uma chave SSH exclusiva para o deploy (~/.ssh/concord_deploy)
#   2. Instala a chave pública na VPS (pede a senha da VPS uma última vez)
#   3. Salva a chave privada e a impressão digital da VPS como secrets do repositório
#   4. Cria as variáveis do deploy (host, usuário, domínio, modo)
#
# Concord de testes (homologação, ver deploy/STAGING.md), em outra VPS. Só mexe nas variáveis STAGING_*:
#   powershell -ExecutionPolicy Bypass -File .\deploy\setup-cicd.ps1 -Staging -VpsHost IP -Domain teste.seudominio.com -Users "voce,amigo"
param(
  [Parameter(Mandatory = $true)][string]$VpsHost,  # IP ou nome da VPS
  [string]$VpsUser = "root",
  [Parameter(Mandatory = $true)][string]$Domain,   # ex.: concord.seudominio.com
  [string]$Mode = "tunnel",
  [string]$Repo = "",
  [switch]$Staging,                                # configura o Concord de testes em vez da produção
  [string]$Users = ""                              # só com -Staging: quem pode entrar (nomes de usuário, separados por vírgula)
)
$ErrorActionPreference = "Stop"
if (-not $Repo) { $Repo = (gh repo view --json nameWithOwner -q .nameWithOwner) }
Write-Host ">> Repositório: $Repo"

# O teste tem chave própria: ele roda código ainda não revisado, e a chave dele não pode abrir a produção.
$keyName = "concord_deploy"
if ($Staging) { $keyName = "concord_deploy_staging" }
$key = Join-Path $env:USERPROFILE ".ssh\$keyName"
$keyComment = "github-actions-concord"
if ($Staging) { $keyComment = "github-actions-concord-staging" }
if (-not (Test-Path $key)) {
  Write-Host ">> Gerando chave de deploy em $key"
  New-Item -ItemType Directory -Force (Split-Path $key) | Out-Null
  ssh-keygen -t ed25519 -N '""' -C $keyComment -f $key | Out-Null
}

Write-Host ">> Instalando a chave pública na VPS (digite a senha da VPS se pedir)..."
$pub = (Get-Content "$key.pub" -Raw).Trim()
ssh "$VpsUser@$VpsHost" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && grep -qF '$pub' ~/.ssh/authorized_keys || echo '$pub' >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys"

Write-Host ">> Testando acesso pela chave..."
ssh -i $key -o BatchMode=yes "$VpsUser@$VpsHost" "echo chave OK"

Write-Host ">> Salvando secrets e variáveis no GitHub..."
# usa a identificação da VPS que este PC já confia (gravada no known_hosts ao conectar acima)
$known = Join-Path $env:TEMP "concord_known_hosts"
cmd /c "ssh-keygen -F $VpsHost | findstr /v /b # > `"$known`""

if ($Staging) {
  # A chave da produção (comentário "github-actions-concord") não tem o que fazer na VPS do teste: sai daqui.
  ssh -i $key -o BatchMode=yes "$VpsUser@$VpsHost" "sed -i '/ github-actions-concord$/d' ~/.ssh/authorized_keys"
  # Secrets no environment "staging", que só a branch staging usa: workflow de outra branch não lê a chave.
  cmd /c "gh secret set STAGING_VPS_SSH_KEY --env staging -R $Repo < `"$key`""
  cmd /c "gh secret set STAGING_VPS_KNOWN_HOSTS --env staging -R $Repo < `"$known`""
  Remove-Item $known
  # versões antigas deste script gravavam no repositório inteiro (apagar o que não existe não é erro)
  $ErrorActionPreference = "Continue"
  foreach ($old in @("STAGING_VPS_SSH_KEY", "STAGING_VPS_KNOWN_HOSTS")) { gh secret delete $old -R $Repo 2>$null }
  $ErrorActionPreference = "Stop"
  gh variable set STAGING_VPS_HOST -R $Repo -b $VpsHost
  gh variable set STAGING_VPS_USER -R $Repo -b $VpsUser
  gh variable set STAGING_DOMAIN -R $Repo -b $Domain
  gh variable set STAGING_DEPLOY_MODE -R $Repo -b $Mode
  # A lista de quem entra é secret: o repositório é público e o log do deploy mostraria os nomes (aí alguém cria
  # a conta com o nome de quem ainda não se cadastrou). O portal /admin do teste (STAGING_ADMIN_USERS, também
  # secret) fica para depois: nome de admin sem conta fica reservado, e ninguém consegue criá-la.
  if ($Users) {
    gh secret set STAGING_USERS --env staging -R $Repo -b $Users
    $ErrorActionPreference = "Continue"
    gh variable delete STAGING_USERS -R $Repo 2>$null
    $ErrorActionPreference = "Stop"
  }
  Write-Host ""
  Write-Host ">> Pronto! Todo push na branch staging agora testa e faz deploy no Concord de testes."
  Write-Host ">> Para subir a main no teste: git push origin main:staging"
  Write-Host ">> O login com Google fica desligado no teste (ver deploy/STAGING.md para ligar com um cliente OAuth próprio)."
  exit 0
}

cmd /c "gh secret set VPS_SSH_KEY -R $Repo < `"$key`""
cmd /c "gh secret set VPS_KNOWN_HOSTS -R $Repo < `"$known`""
Remove-Item $known
gh variable set VPS_HOST -R $Repo -b $VpsHost
gh variable set VPS_USER -R $Repo -b $VpsUser
gh variable set DEPLOY_DOMAIN -R $Repo -b $Domain
gh variable set DEPLOY_MODE -R $Repo -b $Mode

Write-Host ""
Write-Host ">> Pronto! Todo push na branch main agora testa e faz deploy automaticamente."
Write-Host ">> Para disparar agora: gh workflow run ci-cd.yml -R $Repo"
