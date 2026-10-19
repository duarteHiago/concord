#!/usr/bin/env bash
# Instalação do Concord numa VPS Linux (Ubuntu/Debian). Rode na raiz do projeto:
#   ./deploy/setup.sh                                   -> modo direto (Caddy + Let's Encrypt)
#   MODE=tunnel DOMAIN=concord.seudominio.com ./deploy/setup.sh  -> via Cloudflare Tunnel (cloudflared)
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${MODE:-direct}"
TUNNEL_NAME="${TUNNEL_NAME:-concord}"
PROXY_PORT="${PROXY_PORT:-8090}"

if ! command -v docker >/dev/null 2>&1; then
  echo ">> Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
fi

if [ ! -f .env ]; then
  DOMAIN="${DOMAIN:-}"
  [ -z "$DOMAIN" ] && read -rp "Domínio (ex.: concord.seudominio.com): " DOMAIN
  cat > .env <<EOF
DOMAIN=${DOMAIN}
JWT_SECRET=$(openssl rand -hex 32)
LIVEKIT_API_KEY=concord
LIVEKIT_API_SECRET=$(openssl rand -hex 32)
ALLOW_REGISTRATION=true
EOF
  echo ">> .env criado."
elif [ -n "${DOMAIN:-}" ]; then
  sed -i "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" .env
fi
DOMAIN="$(grep ^DOMAIN= .env | cut -d= -f2)"

# Convite do servidor oficial da comunidade (o app mostra "Entrar na comunidade"). Vem da variável do CI.
if [ -n "${COMMUNITY_INVITE:-}" ]; then
  if ! printf '%s' "$COMMUNITY_INVITE" | grep -qE '^[A-Za-z0-9_-]{4,64}$'; then
    echo ">> COMMUNITY_INVITE inválido (use só o código do convite)." >&2
  elif grep -q '^COMMUNITY_INVITE=' .env; then
    sed -i "s|^COMMUNITY_INVITE=.*|COMMUNITY_INVITE=${COMMUNITY_INVITE}|" .env
  else
    echo "COMMUNITY_INVITE=${COMMUNITY_INVITE}" >> .env
  fi
fi

# senha do Grafana: gerada aqui na VPS e nunca impressa (os logs do CI são públicos)
if ! grep -q '^GRAFANA_ADMIN_PASSWORD=' .env; then
  echo "GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)" >> .env
  echo ">> Senha do Grafana criada no .env (veja com: grep GRAFANA_ADMIN_PASSWORD $(pwd)/.env)"
fi

COMPOSE=(docker compose)
if [ "$MODE" = "tunnel" ]; then
  COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.tunnel.yml)

  if ! command -v cloudflared >/dev/null 2>&1; then
    echo ">> Instalando cloudflared..."
    ARCH="$(dpkg --print-architecture)"
    curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
    dpkg -i /tmp/cloudflared.deb
  fi

  if ss -ltnH "sport = :${PROXY_PORT}" | grep -q . && ! docker ps --format '{{.Names}}' | grep -q caddy; then
    echo "!! A porta ${PROXY_PORT} já está em uso. Rode de novo com PROXY_PORT=<outra porta> e ajuste deploy/Caddyfile.tunnel."
    exit 1
  fi

  if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
    echo
    echo ">> Abra o link abaixo no seu navegador, entre na Cloudflare e escolha o domínio:"
    cloudflared tunnel login
  fi

  CONFIG=/etc/cloudflared/config.yml
  RULE="  - hostname: ${DOMAIN}
    service: http://127.0.0.1:${PROXY_PORT}"

  if [ -f "$CONFIG" ] && grep -q '^tunnel:' "$CONFIG"; then
    # Já existe um túnel rodando nesta VPS: reaproveita e só acrescenta a regra do Concord.
    TUNNEL_ID="$(grep '^tunnel:' "$CONFIG" | awk '{print $2}')"
    echo ">> Reaproveitando o túnel existente ($TUNNEL_ID)"
    if grep -qE "hostname:[[:space:]]*${DOMAIN}[[:space:]]*$" "$CONFIG"; then
      echo ">> A regra para ${DOMAIN} já existe no $CONFIG"
      TUNNEL_UNCHANGED=1
    else
      BACKUP="${CONFIG}.bak-$(date +%Y%m%d%H%M%S)"
      cp "$CONFIG" "$BACKUP"
      echo ">> Backup do config: $BACKUP"
      # insere a regra antes da regra final (http_status:404)
      awk -v rule="$RULE" '/^[[:space:]]*- service: http_status:404/ && !done { print rule; done=1 } { print }' "$BACKUP" > "$CONFIG"
      if ! cloudflared tunnel --config "$CONFIG" ingress validate; then
        echo "!! Config inválido, restaurando o backup."
        cp "$BACKUP" "$CONFIG"
        exit 1
      fi
    fi
  else
    if ! cloudflared tunnel info "$TUNNEL_NAME" >/dev/null 2>&1; then
      cloudflared tunnel create "$TUNNEL_NAME"
    fi
    TUNNEL_ID="$(cloudflared tunnel list --name "$TUNNEL_NAME" --output json | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)"
    mkdir -p /etc/cloudflared
    cat > "$CONFIG" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${HOME}/.cloudflared/${TUNNEL_ID}.json
ingress:
${RULE}
  - service: http_status:404
EOF
  fi

  echo ">> Criando o subdomínio $DOMAIN na Cloudflare..."
  cloudflared tunnel route dns --overwrite-dns "$TUNNEL_ID" "$DOMAIN"

  if [ "${TUNNEL_UNCHANGED:-0}" = 1 ]; then
    echo ">> Túnel sem alterações, não precisa reiniciar."
  elif systemctl list-unit-files | grep -q '^cloudflared.service'; then
    systemctl restart cloudflared
  else
    cloudflared service install
  fi
fi

# Firewall: tudo fechado na entrada, menos SSH e a mídia do LiveKit (WebRTC vai direto do navegador
# para a VPS, não passa pelo proxy da Cloudflare). No modo túnel o site não precisa de porta nenhuma:
# o cloudflared é quem abre a conexão para fora. No modo direto, 80/443 só aceitam os IPs da Cloudflare.
# FIREWALL=off pula esta parte (quem já cuida do firewall de outro jeito).
if [ "${FIREWALL:-on}" != "off" ]; then
  command -v ufw >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq ufw >/dev/null; }
  echo ">> Configurando o firewall (ufw)..."
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  # SSH primeiro: sem isso, ligar o ufw trancaria o próprio deploy do lado de fora
  SSH_PORT="$(ss -ltnpH 2>/dev/null | awk '/sshd/ {split($4, a, ":"); print a[length(a)]; exit}')"
  ufw allow "${SSH_PORT:-22}/tcp" >/dev/null
  ufw allow 7881/tcp >/dev/null
  ufw allow 7882/udp >/dev/null
  # 7880 (sinalização/API do LiveKit) e 3000 (app): só pelo proxy local, nunca de fora
  for p in 80 443 3000 7880; do
    ufw delete allow "$p/tcp" >/dev/null 2>&1 || true
  done
  ufw deny 7880/tcp >/dev/null
  if [ "$MODE" != "tunnel" ]; then
    # lista oficial da Cloudflare; regras antigas com o comentário "cloudflare" são trocadas pelas atuais
    CF_IPS="$(curl -fsS --max-time 15 https://www.cloudflare.com/ips-v4; echo; curl -fsS --max-time 15 https://www.cloudflare.com/ips-v6)"
    if [ -n "$(printf '%s' "$CF_IPS" | tr -d '[:space:]')" ]; then
      while ufw status numbered | grep -q 'cloudflare'; do
        n="$(ufw status numbered | grep 'cloudflare' | head -1 | sed -E 's/^\[ *([0-9]+)\].*/\1/')"
        yes | ufw delete "$n" >/dev/null
      done
      for ip in $CF_IPS; do
        ufw allow proto tcp from "$ip" to any port 80,443 comment cloudflare >/dev/null
      done
    else
      echo "!! Não consegui baixar a lista de IPs da Cloudflare; mantendo 80/443 fechadas por enquanto." >&2
    fi
  fi
  ufw --force enable >/dev/null
  echo ">> Firewall ativo: liberadas ${SSH_PORT:-22}/tcp (SSH), 7881/tcp e 7882/udp (mídia)$([ "$MODE" != "tunnel" ] && echo ' e 80/443 só para a Cloudflare')."
fi

if [ -z "$("${COMPOSE[@]}" ps -q 2>/dev/null)" ]; then
  BUSY=""
  for p in 3000 7880 7881; do ss -ltnH "sport = :$p" | grep -q . && BUSY="$BUSY $p/tcp"; done
  ss -lunH "sport = :7882" | grep -q . && BUSY="$BUSY 7882/udp"
  if [ -n "$BUSY" ]; then
    echo "!! Portas já em uso por outro serviço:$BUSY"
    echo "!! Veja quem está usando com: ss -ltnup | grep -E ':(3000|7880|7881|7882)'"
    exit 1
  fi
fi

# ---- monitoramento (Prometheus + Grafana em https://DOMINIO/grafana). MONITORING=off desliga.
if [ "${MONITORING:-on}" != "off" ]; then
  MON_PORTS="19090 19100 19323 19115 13001"
  if ! docker ps --format '{{.Names}}' | grep -q -- '-prometheus-'; then
    BUSY=""
    for p in $MON_PORTS; do ss -ltnH "sport = :$p" | grep -q . && BUSY="$BUSY $p"; done
    if [ -n "$BUSY" ]; then
      echo "!! Monitoramento não instalado: portas já em uso por outro serviço:$BUSY"
      MONITORING=off
    fi
  fi
fi
if [ "${MONITORING:-on}" != "off" ]; then
  sed "s|__DOMAIN__|${DOMAIN}|g" deploy/monitoring/prometheus.yml.tmpl > deploy/monitoring/prometheus.yml
  COMPOSE+=(-f docker-compose.monitoring.yml)
fi

mkdir -p data
"${COMPOSE[@]}" up -d --build --remove-orphans
# recarrega o Caddyfile caso ele tenha mudado (o compose não detecta mudança no arquivo montado)
"${COMPOSE[@]}" restart caddy
# o LiveKit só lê a configuração ao iniciar: reinicia só se ela mudou (derruba as chamadas por alguns segundos)
LK_SUM="$(sha256sum deploy/livekit.yaml | cut -d' ' -f1)"
if [ "$(cat data/.livekit.sha 2>/dev/null)" != "$LK_SUM" ]; then
  echo ">> Configuração do LiveKit mudou: reiniciando o LiveKit"
  "${COMPOSE[@]}" restart livekit
  echo "$LK_SUM" > data/.livekit.sha
fi
echo
if [ "${MONITORING:-on}" != "off" ]; then
  # recarrega a configuração do Prometheus (alvos novos) sem perder o histórico
  "${COMPOSE[@]}" kill -s SIGHUP prometheus >/dev/null 2>&1 || true
fi
echo ">> Pronto! Acesse https://${DOMAIN}"
if [ "${MONITORING:-on}" != "off" ]; then
  echo ">> Monitoramento: https://${DOMAIN}/grafana  (usuário: admin; senha: grep GRAFANA_ADMIN_PASSWORD $(pwd)/.env)"
fi
if [ "$MODE" = "tunnel" ]; then
  echo ">> Se o provedor tiver firewall no painel, libere: 7881/tcp e 7882/udp (mídia da transmissão)."
else
  echo ">> Se o provedor tiver firewall no painel, libere: 80/tcp, 443/tcp, 7881/tcp, 7882/udp."
fi
