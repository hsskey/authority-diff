FROM node:22

RUN corepack enable
WORKDIR /app

# The root prepare script runs `git config`, which needs a repository to exist.
RUN git init -q

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm install --frozen-lockfile

EXPOSE 8787
CMD ["pnpm", "--filter", "@authority/server", "start"]
