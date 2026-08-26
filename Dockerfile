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

# ffmpeg-static/ffprobe-static (installed below via npm) download one fixed
# pre-built binary per platform from eugeneware/ffmpeg-static's GitHub
# releases -- confirmed via a real production failure that its Linux build
# is missing --enable-libharfbuzz, which the drawtext filter requires (used
# for every badge/watermark/intro/outro text this app renders). apt's
# ffmpeg is a full-featured build with drawtext support, and
# server/src/lib/ffmpegBinaries.js prefers it over the incomplete static
# binary whenever it's present at this path.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# ffmpeg-static/ffprobe-static's own postinstall download still needs to run
# inside this Linux image (not copied from a host install) since the code
# falls back to their downloaded binary wherever apt's ffmpeg isn't found
# (e.g. local non-Docker dev).
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

# Deliberately no VOLUME declaration here. Declaring one per path (an
# earlier version of this Dockerfile did, for output/assets/tmp) makes
# Docker create a separate anonymous volume for each path even when no real
# disk is attached -- confirmed via a real production failure: code that
# fs.renameSync'd a file from tmp/ into assets/ threw EXDEV (cross-device
# link) because the two paths landed on different filesystems inside the
# container. server/src/lib/moveFile.js now falls back to copy+delete on
# EXDEV regardless, but there's no reason to keep splitting the filesystem
# for a benefit (persistence) that only exists once a real disk is actually
# mounted -- and Render mounts exactly one disk at one path (see
# DEPLOYMENT.md), so a multi-path VOLUME declaration was never going to
# match that anyway.
CMD ["node", "src/index.js"]
