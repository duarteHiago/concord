# ---------- build do frontend ----------
FROM node:26-alpine AS client
WORKDIR /app
COPY shared ./shared
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci --no-audit --no-fund
COPY client ./client
RUN cd client && npm run build

# ---------- imagem final ----------
FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/concord.db \
    PUBLIC_DIR=/app/client/dist
COPY shared ./shared
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund
COPY server/src ./server/src
COPY --from=client /app/client/dist ./client/dist
WORKDIR /app/server
VOLUME /data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
