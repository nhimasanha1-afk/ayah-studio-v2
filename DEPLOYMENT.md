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

`server/src/lib/paths.js` roots every regenerable/persistent path (exports,
downloaded audio/background caches, generated placeholders, uploaded
logos/background videos, AI-generated backgrounds) under one `DATA_DIR`
env var, defaulting to the `server/` folder itself when unset — today's
behavior, fine for local dev, but it means a redeploy or restart wipes all
of it. Point `DATA_DIR` at one mounted disk in production (e.g. `/data`)
and all of that survives instead. `server/assets/fonts/` is the one
exception — checked-in, image-bundled, never regenerable, so it always
lives with the code regardless of `DATA_DIR`.

`docker-compose.yml` sets `DATA_DIR=/data` and mounts a single named volume
there. Because fonts are excluded from `DATA_DIR`, the mounted volume needs
no seeding from the image — it can start genuinely empty.

`server/tmp/` (scratch subtitle `.ass` files, in-flight uploads before
they're moved into `DATA_DIR`) is deliberately never under `DATA_DIR` — it's
fine to lose on restart, and putting it on the same volume as everything
else caused a real bug (see below).

Losing `DATA_DIR`'s cache subdirectories isn't destructive — everything in
them regenerates on demand (`ensureAudioCached`, `ensureBackgroundClipCached`,
`ensureStaticBackground`, `ensurePlaceholderLogo`) — but without a volume,
every redeploy re-downloads/re-renders them and any user-uploaded or
AI-generated background videos are permanently lost.

**A real bug this caused, and how it's handled now:** an earlier version of
the `Dockerfile` declared separate `VOLUME`s for `output`, `assets`, and
`tmp`. Declaring a `VOLUME` per path makes Docker create a separate
anonymous volume for each one even when no real disk is attached — which
meant `tmp` and `assets` silently lived on different filesystems inside the
container. Code that persists an upload writes it to `tmp/` first, then
`fs.renameSync`s it into its final location once validated; `rename()`
can't cross filesystems, so every upload (including AI-generated
backgrounds, which reuse the same persistence path) failed with `EXDEV:
cross-device link not permitted` in production — confirmed by actually
triggering a real Runway generation against the live deployment and
watching it fail at the save step. Fixed two ways: the `Dockerfile` no
longer declares per-path `VOLUME`s at all, and `server/src/lib/moveFile.js`
falls back to copy+delete whenever a plain rename hits `EXDEV`, so this is
safe regardless of how volumes end up laid out in any future deployment
(a real mounted disk is still a different filesystem from the container's
own layer, so this fallback is expected to actually run in production, not
just exist for theoretical safety).

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
  -e DATA_DIR=/data \
  -v ayah-data:/data \
  ayah-studio
```

## What's actually been verified

This app is live on Render (free tier) and has been exercised for real,
repeatedly, against that deployment — not just checked locally:

- Real exports end-to-end (captions, styling, intro/outro, audio sync,
  multiple languages, background rotation/crossfades) downloaded and
  visually inspected frame-by-frame.
- A real AI-generated background (Runway) requested, downloaded, and
  composited into an export.
- Two production-only bugs were caught this way and fixed: the bundled
  `ffmpeg-static` binary silently lacking `drawtext` support on Linux, and
  the `EXDEV` cross-device rename failure described above under
  **Persistent data**. Neither reproduced locally on Windows — both only
  showed up against the real container, which is the reason to actually
  deploy and exercise a change rather than trusting it from local checks
  alone.
- A real memory ceiling was measured directly (see **Resource notes**) by
  polling the ffmpeg process's actual peak working set during a real
  crossfade export, not estimated.

Docker itself was never available in the sandbox this was originally built
in, so the image has never been built and run *locally* — every check
above went through a real deploy to Render instead. If you build and run
it locally (`docker compose up --build`), that exercises the same
Dockerfile but is still worth treating as a first real run of that path.

## Environment variables

See `.env.example`; loaded via `dotenv` (`server/src/index.js` imports `dotenv/config` at startup).

- `PORT` — what the server listens on (default `4000`).
- `DATA_DIR` — optional. Root for exports/caches/uploads; defaults to the `server/` folder itself (no persistence across restarts/redeploys). Set to a mounted disk's path (e.g. `/data`) to persist that state — see **Persistent data** above.
- `RUNWAYML_API_SECRET` — optional. Only required for AI-generated background video (`POST /api/uploads/background-video/generate`, backed by Runway's gen4.5 text-to-video model). Get a key at [dev.runwayml.com](https://dev.runwayml.com) — a real, paid, per-generation cost, confirmed by actually running one against the live deployment. Without it set, that one endpoint returns a clear error; nothing else in the app is affected. Pass it as a real runtime environment variable to the container (`docker run -e RUNWAYML_API_SECRET=... `, or the equivalent in your platform's dashboard) — it must never be baked into the image (see `.dockerignore`'s `.env` exclusion).

## Resource notes

FFmpeg encoding is CPU-bound, not GPU-accelerated in this setup, and libx264
runs at the `veryfast` preset specifically to keep both CPU time and memory
down (see `server/src/lib/surahExport.js`). Measured directly against a real
2-clip background crossfade export at 720p: **456MB peak working set** for
the ffmpeg process alone (down from 559MB at the default `medium` preset) —
already close to the 512MB ceiling Render's Free/Starter tiers share, so a
heavier case (more simultaneous clips, 1080p, longer transitions) can still
exceed it, especially with Node's own overhead added on top. A 512MB-RAM
host is workable for light/occasional use; 1GB+ RAM removes the risk
outright. More CPU directly shortens export wait times regardless of RAM.
Disk needs scale with how much of the background-clip/audio cache and
export history you want `DATA_DIR` to retain.

## Platform notes

Any host that can run an arbitrary Docker image with a persistent volume
and a long-running process works — this is a plain container, not a
serverless function (exports are long-running CPU work with local disk
state, which rules out most serverless/edge platforms). A few common
options, in order of how little setup they need:

- **Render** — "New Web Service" from this repo, it detects the
  `Dockerfile` automatically. Render mounts exactly one disk at one path
  per service (confirmed directly from Render's own docs) — add a
  persistent Disk mounted at `/data` under the service's Disk settings, and
  set `DATA_DIR=/data` as an environment variable. Set the health check
  path to `/api/health`. (Disks require a paid plan — Starter or above;
  note Starter has the *same* 512MB RAM as Free, only more CPU, so it
  doesn't help the memory ceiling above — Standard is the first tier with
  more RAM.)
- **Fly.io** — `fly launch` detects the `Dockerfile`. Create a volume
  (`fly volumes create`) and mount it at `/data` in `fly.toml`, set
  `DATA_DIR=/data`, then `fly deploy`.
- **Railway** — connect the repo; it builds from the `Dockerfile`
  automatically. Add a Volume in the service's settings mounted at `/data`,
  and set `DATA_DIR=/data` as an environment variable.
- **A plain VPS** — install Docker, copy the repo over, run
  `docker compose up -d`. Put a reverse proxy (Caddy or nginx) in front for
  TLS/a domain; Caddy in particular needs close to zero config for this
  (a single-line `Caddyfile` reverse-proxying to `localhost:4000`).

None of the above have been signed up for or configured — pick one and work
through its own setup flow with the image described here as the deploy
target.
