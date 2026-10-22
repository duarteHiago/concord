#!/usr/bin/env bash
# Grava um perfil de CPU do app durante um teste de carga e mostra onde o tempo foi gasto (funções e arquivos).
# Rode na VPS, na pasta do Concord, com a carga já rodando:
#   ./deploy/monitoring/perfil.sh        30 segundos
#   ./deploy/monitoring/perfil.sh 60     de 5 a 120 segundos
# O resumo aparece aqui e fica em data/perfis/; o .cpuprofile completo também (abre no Chrome DevTools,
# aba Performance, ou em https://www.speedscope.app). Para baixar para o seu computador:
#   scp root@VPS:/opt/concord/data/perfis/perfil-....cpuprofile .
set -euo pipefail
cd "$(dirname "$0")/../.."

SECS="${1:-30}"
# deixa a faixa marcada nos painéis (se o monitoramento estiver ligado)
./deploy/monitoring/marcar.sh "perfil de CPU (${SECS} s)" >/dev/null 2>&1 || true
echo ">> Gravando ${SECS} s de perfil de CPU do app..."
mkdir -p data/perfis
OUT="data/perfis/resumo-$(date -u +%Y-%m-%d-%H-%M-%S).txt"
curl -fsS --max-time $((SECS + 60)) "http://127.0.0.1:9464/debug/perfil?segundos=${SECS}" | tee "$OUT"
# dentro do container o caminho é /data/...; aqui fora é ./data/...
echo ">> Resumo salvo em $OUT (o arquivo completo está na mesma pasta: data/perfis/)"
