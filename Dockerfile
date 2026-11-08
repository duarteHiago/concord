# ---------- build do frontend ----------
FROM node:26-alpine AS client
WORKDIR /app
COPY shared ./shared
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci --no-audit --no-fund
COPY client ./client
# Concord de testes (homologação): logo e ícones com outras cores (client/staging/public) e a faixa no app
ARG STAGING=false
ENV VITE_STAGING=$STAGING
RUN if [ "$STAGING" = "true" ]; then cp -r client/staging/public/. client/public/; fi \
    && cd client && npm run build

# ---------- imagem final ----------
FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/concord.db \
    PUBLIC_DIR=/app/client/dist
COPY shared ./shared
COPY server/package.json server/package-lock.json ./server/
# o npm só serve para instalar: sai da imagem final (e leva junto as dependências dele, que o Trivy acusa)
RUN cd server && npm ci --omit=dev --no-audit --no-fund \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
       /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY server/src ./server/src
COPY --from=client /app/client/dist ./client/dist
WORKDIR /app/server
# O servidor roda sem root (usuário "node", uid 1000). Ele usa a rede do host, que pode ter outros serviços:
# uma falha no app não vira controle da máquina. Tudo o que ele grava fica em /data.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
