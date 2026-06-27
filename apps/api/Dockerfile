# syntax=docker/dockerfile:1
# 构建上下文 = 仓库根（见 docker-compose.prod.yml 的 build.context）。
# 用 --ignore-scripts 跳过 @swim/shared 的 prepare 与 api postinstall，改为显式构建/生成，
# 以保证层顺序可控（prepare 需要源码、postinstall 需要 schema）。

FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
COPY packages ./packages
COPY apps/api ./apps/api
# 源码先就位再 npm ci：触发 @swim/shared 的 prepare(tsc) 构建其 dist，
# 及 @swim/api 的 postinstall(prisma generate) 生成 client。随后仅需编译 api。
RUN npm ci
RUN npm run build -w @swim/api

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Prisma 引擎在 slim 镜像需要 openssl。
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
# 直接搬运构建产物，运行期不再 npm 安装（规避 monorepo 的 prepare/postinstall 脚本）。
# node_modules 含已安装依赖、prisma CLI（供 migrate deploy）与已生成的 client；
# packages/shared 含其 dist，apps/api 含编译产物与 prisma schema。
# 镜像瘦身（仅 prod 依赖）留作后续优化。
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
USER node
EXPOSE 3000
WORKDIR /app/apps/api
# 启动即对齐迁移，然后起服务。
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
