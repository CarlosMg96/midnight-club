FROM node:26-bookworm-slim

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV PNPM_HOME=/home/node/.local/share/pnpm
ENV PATH="$PNPM_HOME:$PATH"

RUN npm install -g corepack && corepack enable && corepack prepare pnpm@10.30.0 --activate

WORKDIR /app

RUN mkdir -p /app /home/node/.local/share/pnpm/store \
  && chown -R node:node /app /home/node/.local

COPY --chown=node:node package.json pnpm-lock.yaml ./

USER node

RUN pnpm install --frozen-lockfile

COPY --chown=node:node . .

EXPOSE 5173

STOPSIGNAL SIGTERM

CMD ["pnpm", "run", "dev"]
