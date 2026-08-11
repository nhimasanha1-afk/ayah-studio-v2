# Multi-stage build: compile the Vite/React frontend, then copy the static
# output into the Express server image so one container serves everything
# from a single origin (the frontend calls /api, /output, /uploads as
# relative paths -- see client/vite.config.ts's dev proxy for the same
# mapping -- which only works without extra CORS wiring when same-origin).

FROM node:20-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-bookworm-slim AS server
WORKDIR /app/server

# ffmpeg-static/ffprobe-static download real platform-specific binaries as
# an npm postinstall step, so this must run inside the Linux image (not
# copied from a host install) to get Linux binaries.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./

# Fonts are real checked-in assets the renderer needs and can't regenerate;
# everything else under server/assets is a lazily-created cache (see
# .dockerignore) that repopulates on first use and should live on a volume.
COPY --from=client-build /app/client/dist /app/client/dist

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Exported videos, downloaded audio/background caches, and uploaded
# logos/background clips all live under these paths -- mount volumes here in
# production so a redeploy doesn't wipe user-facing output or force
# re-downloading/re-generating cached assets. See DEPLOYMENT.md.
VOLUME ["/app/server/output", "/app/server/assets", "/app/server/tmp"]

CMD ["node", "src/index.js"]
