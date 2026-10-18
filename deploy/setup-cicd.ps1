# Configura o deploy automático (GitHub Actions -> VPS). Rode UMA vez, na raiz do projeto:
#   powershell -ExecutionPolicy Bypass -File .\deploy\setup-cicd.ps1 -VpsHost IP -Domain concord.seudominio.com
# O que faz:
#   1. Cria uma chave SSH exclusiva para o deploy (~/.ssh/concord_deploy)
#   2. Instala a chave pública na VPS (pede a senha da VPS uma última vez)
#   3. Salva a chave privada e a impressão digital da VPS como secrets do repositório
#   4. Cria as variáveis do deploy (host, usuário, domínio, modo)
param(
  [Parameter(Mandatory = $true)][string]$VpsHost,  # IP ou nome da VPS
  [string]$VpsUser = "root",
  [Parameter(Mandatory = $true)][string]$Domain,   # ex.: concord.seudominio.com
  [string]$Mode = "tunnel",
  [string]$Repo = ""
)
$ErrorActionPreference = "Stop"
if (-not $Repo) { $Repo = (gh repo view --json nameWithOwner -q .nameWithOwner) }
Write-Host ">> Repositório: $Repo"

$key = Join-Path $env:USERPROFILE ".ssh\concord_deploy"
if (-not (Test-Path $key)) {
  Write-Host ">> Gerando chave de deploy em $key"
  New-Item -ItemType Directory -Force (Split-Path $key) | Out-Null
  ssh-keygen -t ed25519 -N '""' -C "github-actions-concord" -f $key | Out-Null
}

Write-Host ">> Instalando a chave pública na VPS (digite a senha da VPS se pedir)..."
$pub = (Get-Content "$key.pub" -Raw).Trim()
ssh "$VpsUser@$VpsHost" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && grep -qF '$pub' ~/.ssh/authorized_keys || echo '$pub' >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys"

Write-Host ">> Testando acesso pela chave..."
ssh -i $key -o BatchMode=yes "$VpsUser@$VpsHost" "echo chave OK"

Write-Host ">> Salvando secrets e variáveis no GitHub..."
cmd /c "gh secret set VPS_SSH_KEY -R $Repo < `"$key`""
# usa a identificação da VPS que este PC já confia (gravada no known_hosts ao conectar acima)
$known = Join-Path $env:TEMP "concord_known_hosts"
cmd /c "ssh-keygen -F $VpsHost | findstr /v /b # > `"$known`""
cmd /c "gh secret set VPS_KNOWN_HOSTS -R $Repo < `"$known`""
Remove-Item $known
gh variable set VPS_HOST -R $Repo -b $VpsHost
gh variable set VPS_USER -R $Repo -b $VpsUser
gh variable set DEPLOY_DOMAIN -R $Repo -b $Domain
gh variable set DEPLOY_MODE -R $Repo -b $Mode

Write-Host ""
Write-Host ">> Pronto! Todo push na branch main agora testa e faz deploy automaticamente."
Write-Host ">> Para disparar agora: gh workflow run ci-cd.yml -R $Repo"
