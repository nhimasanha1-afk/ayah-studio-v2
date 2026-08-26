# Deployment

Ayah Studio ships as a single Docker image: the Express/FFmpeg backend also
serves the built React frontend, so the whole app runs on one origin and one
port. This matters because the frontend calls `/api`, `/output`, and
`/uploads` as **relative** paths (see `client/vite.config.ts`'s dev proxy for
the same mapping) — splitting frontend and backend onto separate hosts would
require adding an absolute API base URL and CORS handling, neither of which
exist in the codebase today. Single-origin is the path of least resistance
for this codebase as it stands.

This document covers image build/run and general platform guidance only —
no hosting account was created and nothing has been deployed. Actually
provisioning a server, registering a domain, or creating an account on a
hosting provider are actions outside what an assistant can do on your
behalf; you'll need to do that part yourself using the steps below.

## What's in the image

Multi-stage `Dockerfile` at the repo root:
1. Builds `client/` with `npm run build` (real production Vite build,
   verified locally — see below).
2. Installs `server/`'s production dependencies (`npm ci --omit=dev`) —
   critically, this runs *inside* the Linux build image, not copied from a
   host install, because `ffmpeg-static`/`ffprobe-static` download real
   platform-specific binaries as an npm postinstall step. Building on a
   non-Linux host and copying `node_modules` in would ship the wrong
   binaries.
3. Copies the built `client/dist` next to the server and starts
   `node src/index.js`.

## Persistent data

Two directories under `server/` hold state worth surviving restarts and
redeploys:

| Path | What's in it |
|---|---|
| `server/output/` | Rendered `.mp4`/`.srt` export files |
| `server/assets/` | Checked-in fonts (`assets/fonts/`, baked into the image) plus lazily-generated caches: downloaded reciter/Bismillah audio, downloaded background clips, generated placeholder backgrounds/logo, and user-uploaded logos/background videos |

`server/tmp/` (scratch subtitle `.ass` files, in-flight uploads before
they're moved into `assets/`) deliberately has no volume — it's fine to
lose on restart, and giving it one caused a real bug (see below).

`docker-compose.yml` mounts named volumes over `output` and `assets`.
Named volumes are safe to mount directly over `server/assets` even though
it has checked-in content (the fonts) — Docker copies the image's existing
directory contents into a named volume the first time it's used, so the
fonts survive; this only works for named volumes, not bind mounts to an
empty host directory.

Losing `server/assets`'s cache subdirectories isn't destructive — everything
in them regenerates on demand (`ensureAudioCached`, `ensureBackgroundClipCached`,
`ensureStaticBackground`, `ensurePlaceholderLogo`) — but without a volume,
every redeploy re-downloads/re-renders them and any user-uploaded logos or
background videos are permanently lost.

**A real bug this caused, and how it's handled now:** an earlier version of
the `Dockerfile` declared `VOLUME`s for `output`, `assets`, *and* `tmp`.
Declaring a `VOLUME` per path makes Docker create a separate anonymous
volume for each one even when no real disk is attached — which meant `tmp`
and `assets` silently lived on different filesystems inside the container.
Code that uploads a file writes it to `tmp/` first, then
`fs.renameSync`s it into `assets/uploads/` once validated; `rename()`
can't cross filesystems, so every upload (including AI-generated
backgrounds, which reuse the same persistence path) failed with `EXDEV:
cross-device link not permitted` in production, the "no disk attached" free
tier included. Fixed two ways: the `Dockerfile` no longer declares `tmp` as
its own volume, and `server/src/lib/moveFile.js` falls back to copy+delete
whenever a plain rename hits `EXDEV`, so this is safe regardless of how
volumes end up laid out in any future deployment.

## Build and run locally

```bash
docker compose up --build
```

Then open `http://localhost:4000`. This is the same image that would run in
production, so it's a real test of the deploy artifact, not just a dev-mode
smoke test.

Without compose:

```bash
docker build -t ayah-studio .
docker run -p 4000:4000 \
  -v ayah-output:/app/server/output \
  -v ayah-assets:/app/server/assets \
  ayah-studio
```

## What was actually verified (without Docker itself)

Docker wasn't available in the sandbox this was built in, so the image
itself was never built or run end-to-end. What *was* verified directly:

- `npm run build` in `client/` — a real production build, succeeded
  (`dist/index.html`, hashed JS/CSS bundles).
- Running the server with `NODE_ENV=production` against that real
  `client/dist` output — `/api/health` responded, `/` served the built
  `index.html`, and a hashed asset under `/assets/...` served with a real
  `200`. This is exactly the static-serving path the `Dockerfile`'s final
  image would exercise.

Before a real deploy, build and run the actual image once
(`docker compose up --build`) and do a real export through it end-to-end —
the Dockerfile's dependency-install and multi-stage copy steps haven't been
exercised by the checks above.

## Environment variables

See `.env.example`; loaded via `dotenv` (`server/src/index.js` imports `dotenv/config` at startup).

- `PORT` — what the server listens on (default `4000`).
- `RUNWAYML_API_SECRET` — optional. Only required for AI-generated background video (`POST /api/uploads/background-video/generate`, backed by Runway's gen4.5 text-to-video model). Get a key at [dev.runwayml.com](https://dev.runwayml.com) — a real, paid, per-generation cost. Without it set, that one endpoint returns a clear error; nothing else in the app is affected. Pass it as a real runtime environment variable to the container (`docker run -e RUNWAYML_API_SECRET=... `, or the equivalent in your platform's dashboard) — it must never be baked into the image (see `.dockerignore`'s `.env` exclusion).

## Resource notes

FFmpeg encoding is CPU-bound, not GPU-accelerated in this setup. Export time
scales with CPU: expect roughly real-time-to-a-few-times-real-time encoding
per exported video's target length at 720p on a modest shared vCPU, faster
on a dedicated core. Budget at least 1 vCPU / 1GB RAM as a floor; more CPU
directly shortens export wait times. Disk needs scale with how much of the
background-clip/audio cache and export history you want to retain.

## Platform notes

Any host that can run an arbitrary Docker image with a persistent volume
and a long-running process works — this is a plain container, not a
serverless function (exports are long-running CPU work with local disk
state, which rules out most serverless/edge platforms). A few common
options, in order of how little setup they need:

- **Render** — "New Web Service" from this repo, it detects the
  `Dockerfile` automatically. Add a persistent Disk mounted at
  `/app/server` (or separately at each of the three paths above). Set the
  health check path to `/api/health`.
- **Fly.io** — `fly launch` detects the `Dockerfile`. Create a volume
  (`fly volumes create`) and mount it in `fly.toml` over the same paths,
  then `fly deploy`.
- **Railway** — connect the repo; it builds from the `Dockerfile`
  automatically. Add a Volume in the service's settings pointing at
  `/app/server`.
- **A plain VPS** — install Docker, copy the repo over, run
  `docker compose up -d`. Put a reverse proxy (Caddy or nginx) in front for
  TLS/a domain; Caddy in particular needs close to zero config for this
  (a single-line `Caddyfile` reverse-proxying to `localhost:4000`).

None of the above have been signed up for or configured — pick one and work
through its own setup flow with the image described here as the deploy
target.
