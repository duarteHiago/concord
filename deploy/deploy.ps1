# Envia o projeto para a VPS e roda a instalação. Uso (PowerShell, na raiz do projeto):
#   .\deploy\deploy.ps1 -Tunnel -Domain concord.seudominio.com   -> via Cloudflare Tunnel (cria o subdomínio)
#   .\deploy\deploy.ps1 -Domain concord.seudominio.com           -> modo direto (registro A + Let's Encrypt)
#   .\deploy\deploy.ps1                                          -> modo direto em 72-60-150-220.sslip.io
# A senha da VPS é pedida pelo próprio ssh/scp (ou nenhuma, se você usar chave SSH).
param(
  [string]$Server = "root@72.60.150.220",
  [string]$Domain = "72-60-150-220.sslip.io",
  [switch]$Tunnel
)
$ErrorActionPreference = "Stop"
if ($Tunnel -and $Domain -like "*sslip.io") { throw "No modo túnel informe seu subdomínio: -Domain concord.seudominio.com" }
$mode = if ($Tunnel) { "tunnel" } else { "direct" }
$root = Split-Path $PSScriptRoot -Parent
$archive = Join-Path $env:TEMP "concord-deploy.tgz"

Write-Host ">> Empacotando projeto..."
tar -czf $archive -C $root --exclude=node_modules --exclude=./data --exclude=./data-dev --exclude=dist --exclude=.env .

Write-Host ">> Enviando para $Server (digite a senha se pedir)..."
scp $archive "${Server}:/tmp/concord-deploy.tgz"

Write-Host ">> Instalando na VPS (digite a senha se pedir)..."
ssh -t $Server "mkdir -p /opt/concord && tar -xzf /tmp/concord-deploy.tgz -C /opt/concord && cd /opt/concord && sed -i 's/\r$//' deploy/setup.sh && chmod +x deploy/setup.sh && MODE=$mode DOMAIN=$Domain ./deploy/setup.sh"

Write-Host ""
Write-Host ">> Concluído. Acesse: https://$Domain"
