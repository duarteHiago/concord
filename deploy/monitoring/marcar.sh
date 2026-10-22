#!/usr/bin/env bash
# Marca momentos nos painéis do Grafana, para achar depois o que aconteceu num teste de carga.
# Rode na VPS, na pasta do Concord:
#   ./deploy/monitoring/marcar.sh inicio "50 pessoas em voz"   começa uma faixa (fica sombreada nos gráficos)
#   ./deploy/monitoring/marcar.sh fim                          fecha a faixa aberta
#   ./deploy/monitoring/marcar.sh "subi para 100"              marca só um instante
set -euo pipefail
cd "$(dirname "$0")/../.."

PASS="$(grep -E '^GRAFANA_ADMIN_PASSWORD=' .env | cut -d= -f2-)"
API="http://127.0.0.1:13001/grafana/api/annotations"
OPEN=data/.marca-aberta
now() { echo $(($(date +%s) * 1000)); }
json() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
call() { curl -fsS -u "admin:$PASS" -H 'Content-Type: application/json' "$@"; }

case "${1:-}" in
  inicio)
    [ -f "$OPEN" ] && { echo "!! Já tem uma faixa aberta. Feche com: $0 fim" >&2; exit 1; }
    RES="$(call -X POST "$API" -d "{\"time\":$(now),\"tags\":[\"teste-de-carga\"],\"text\":\"$(json "${2:-teste de carga}")\"}")"
    printf '%s' "$RES" | sed -E 's/.*"id":([0-9]+).*/\1/' > "$OPEN"
    echo ">> Faixa aberta: ${2:-teste de carga}"
    ;;
  fim)
    [ -f "$OPEN" ] || { echo "!! Nenhuma faixa aberta." >&2; exit 1; }
    call -X PATCH "$API/$(cat "$OPEN")" -d "{\"timeEnd\":$(now)}" >/dev/null
    rm -f "$OPEN"
    echo ">> Faixa fechada."
    ;;
  "")
    echo "Uso: $0 inicio \"descrição\" | $0 fim | $0 \"descrição\"" >&2
    exit 1
    ;;
  *)
    call -X POST "$API" -d "{\"time\":$(now),\"tags\":[\"teste-de-carga\"],\"text\":\"$(json "$1")\"}" >/dev/null
    echo ">> Marcado: $1"
    ;;
esac
