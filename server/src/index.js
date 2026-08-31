import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import exportRouter from './routes/export.js';
import uploadsRouter from './routes/uploads.js';
import { OUTPUT_DIR, LOGO_UPLOADS_DIR, BACKGROUND_UPLOADS_DIR, CARD_IMAGE_UPLOADS_DIR, TMP_DIR } from './lib/paths.js';
import { cleanupOldOutputs } from './lib/outputCleanup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = OUTPUT_DIR;
const logoUploadsDir = LOGO_UPLOADS_DIR;
const backgroundUploadsDir = BACKGROUND_UPLOADS_DIR;
const cardImageUploadsDir = CARD_IMAGE_UPLOADS_DIR;
const tmpDir = TMP_DIR;
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(logoUploadsDir, { recursive: true });
fs.mkdirSync(backgroundUploadsDir, { recursive: true });
fs.mkdirSync(cardImageUploadsDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

// Exports are real, large files (100-250MB+) written to a persistent disk
// that's really only sized for logos/uploads -- confirmed via a real
// production failure ("No space left on device", mid-export) that nothing
// was ever reclaiming this space, so it silently filled up over time. Sweep
// on startup (so a redeploy immediately reclaims whatever's accumulated)
// and again on an hourly interval thereafter.
function sweepOldOutputs() {
  const { deleted, freedBytes } = cleanupOldOutputs(outputDir);
  if (deleted.length > 0) {
    console.log(`[outputCleanup] deleted ${deleted.length} old export file(s), freed ${(freedBytes / 1024 / 1024).toFixed(1)}MB`);
  }
}
sweepOldOutputs();
setInterval(sweepOldOutputs, 60 * 60 * 1000);

const app = express();
app.locals.outputDir = outputDir;
app.locals.uploadsDir = logoUploadsDir;
app.locals.backgroundUploadsDir = backgroundUploadsDir;
app.locals.cardImageUploadsDir = cardImageUploadsDir;
app.locals.tmpDir = tmpDir;

app.use(cors());
app.use(express.json());
app.use('/output', express.static(outputDir));
app.use('/uploads/logos', express.static(logoUploadsDir));
app.use('/uploads/backgrounds', express.static(backgroundUploadsDir));
app.use('/uploads/card-images', express.static(cardImageUploadsDir));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/export', exportRouter);
app.use('/api/uploads', uploadsRouter);

// In production the client is built separately (client/dist) and copied
// next to this server (see root Dockerfile) so the whole app is served from
// one origin -- the frontend already calls /api, /output, /uploads as
// relative paths (see client/vite.config.ts's dev proxy for the same
// mapping), which only works same-origin without extra CORS wiring. Local
// `npm run dev` never has client/dist, so this block is a no-op there.
const clientDistDir = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDistDir)) {
  // Without explicit Cache-Control, express.static sets no header at all,
  // which leaves browsers free to apply their own heuristic caching to
  // index.html -- confirmed via a real report that other browsers kept
  // loading an old JS bundle after a deploy even after a normal reload,
  // since index.html (which names the current hashed bundle) was the thing
  // getting served stale. Vite's dist/assets/ files are content-hashed
  // (a new build, a new filename) so those are safe to cache forever;
  // index.html is the opposite -- it must always be revalidated so a
  // reload always discovers the latest bundle.
  app.use(
    express.static(clientDistDir, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );
  app.get(/^(?!\/api|\/output|\/uploads).*/, (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDistDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Ayah Studio backend listening on http://localhost:${PORT}`);
});
