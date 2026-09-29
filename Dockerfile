FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
COPY web/package*.json ./web/
RUN npm install
COPY server ./server
COPY web ./web
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080 RUNNING_IN_DOCKER=1 WEB_DIST=/app/web/dist DASHBOARD_CONFIG=/app/config/dashboard.json ASSETS_DIR=/app/assets
COPY package*.json ./
COPY server/package*.json ./server/
COPY web/package*.json ./web/
RUN npm install --omit=dev --workspace server && npm cache clean --force
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
COPY config ./config
COPY assets ./assets
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/dist/index.js"]
