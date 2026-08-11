import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import exportRouter from './routes/export.js';
import uploadsRouter from './routes/uploads.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, '..', 'output');
const logoUploadsDir = path.join(__dirname, '..', 'assets', 'logos', 'uploads');
const backgroundUploadsDir = path.join(__dirname, '..', 'assets', 'backgrounds', 'uploads');
const tmpDir = path.join(__dirname, '..', 'tmp');
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(logoUploadsDir, { recursive: true });
fs.mkdirSync(backgroundUploadsDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

const app = express();
app.locals.outputDir = outputDir;
app.locals.uploadsDir = logoUploadsDir;
app.locals.backgroundUploadsDir = backgroundUploadsDir;
app.locals.tmpDir = tmpDir;

app.use(cors());
app.use(express.json());
app.use('/output', express.static(outputDir));
app.use('/uploads/logos', express.static(logoUploadsDir));
app.use('/uploads/backgrounds', express.static(backgroundUploadsDir));

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
  app.use(express.static(clientDistDir));
  app.get(/^(?!\/api|\/output|\/uploads).*/, (req, res) => {
    res.sendFile(path.join(clientDistDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Ayah Studio backend listening on http://localhost:${PORT}`);
});
