FROM apify/actor-node:24 AS builder

# Cache dependencies separately from source changes.
COPY --chown=myuser:myuser package*.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY --chown=myuser:myuser tsconfig.json ./
COPY --chown=myuser:myuser src ./src
RUN npm run build

FROM apify/actor-node:24

COPY --chown=myuser:myuser package*.json ./
RUN npm ci --omit=dev --omit=optional --no-audit --no-fund \
    && npm cache clean --force

COPY --from=builder --chown=myuser:myuser /usr/src/app/dist ./dist

CMD ["node", "dist/main.js"]
