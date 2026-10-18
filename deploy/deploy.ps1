# Envia o projeto para a VPS e roda a instalação. Uso (PowerShell, na raiz do projeto):
#   .\deploy\deploy.ps1 -Server root@IP -Tunnel -Domain concord.seudominio.com   -> via Cloudflare Tunnel (cria o subdomínio)
#   .\deploy\deploy.ps1 -Server root@IP -Domain concord.seudominio.com           -> modo direto (registro A + Let's Encrypt)
#   .\deploy\deploy.ps1 -Server root@IP -Domain IP-COM-HIFENS.sslip.io           -> modo direto sem domínio próprio
# A senha da VPS é pedida pelo próprio ssh/scp (ou nenhuma, se você usar chave SSH).
param(
  [Parameter(Mandatory = $true)][string]$Server,   # ex.: root@203.0.113.10
  [Parameter(Mandatory = $true)][string]$Domain,   # ex.: concord.seudominio.com
  [switch]$Tunnel
)
$ErrorActionPreference = "Stop"
if ($Tunnel -and $Domain -like "*sslip.io") { throw "No modo túnel use um subdomínio seu (o sslip.io não funciona com túnel)" }
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
