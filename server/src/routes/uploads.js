import { Router } from 'express';
import multer from 'multer';
import { persistLogoUpload } from '../lib/logoUpload.js';
import { persistBackgroundVideoUpload } from '../lib/backgroundVideoUpload.js';
import { generateBackgroundVideo } from '../lib/runwayVideoGen.js';
import { createJob, getJob, updateJob } from '../lib/jobQueue.js';

const ALLOWED_MIMETYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

// Memory storage: nothing touches disk until persistLogoUpload has ffprobe
// confirm the bytes are a real, decodable image. This mimetype filter is
// only a cheap first pass (Content-Type is client-supplied and easy to
// spoof) -- the actual security boundary is the content-based check.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(new Error('Only PNG, JPEG, or WebP images are accepted.'));
      return;
    }
    cb(null, true);
  },
});

const ALLOWED_VIDEO_MIMETYPES = new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-matroska']);
const MAX_VIDEO_UPLOAD_BYTES = 200 * 1024 * 1024; // 200MB

// Same memory-storage + content-based-validation pattern as the logo
// upload above -- persistBackgroundVideoUpload's ffprobe check is the real
// security boundary, this mimetype filter is only a cheap first pass.
const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_VIDEO_MIMETYPES.has(file.mimetype)) {
      cb(new Error('Only MP4, WebM, MOV, or MKV videos are accepted.'));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

router.post('/logo', (req, res) => {
  upload.single('logo')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message ?? 'Upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded (expected field "logo").' });
    }

    try {
      const { uploadsDir, tmpDir } = req.app.locals;
      const { logoId, width, height } = await persistLogoUpload(req.file.buffer, uploadsDir, tmpDir);
      res.json({ logoId, url: `/uploads/logos/${logoId}`, width, height });
    } catch (validationErr) {
      console.error('[uploads] logo validation failed:', validationErr);
      res.status(400).json({ error: validationErr.message ?? 'Invalid image.' });
    }
  });
});

router.post('/background-video', (req, res) => {
  uploadVideo.single('video')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message ?? 'Upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded (expected field "video").' });
    }

    try {
      const { backgroundUploadsDir, tmpDir } = req.app.locals;
      const { clipId, width, height, durationSeconds } = await persistBackgroundVideoUpload(
        req.file.buffer,
        backgroundUploadsDir,
        tmpDir
      );
      res.json({ clipId, url: `/uploads/backgrounds/${clipId}`, width, height, durationSeconds });
    } catch (validationErr) {
      console.error('[uploads] background video validation failed:', validationErr);
      res.status(400).json({ error: validationErr.message ?? 'Invalid video.' });
    }
  });
});

// AI background generation via Runway (gen4.5 text-to-video) is a real,
// paid, multi-minute external call, so it follows the same async
// start-job -> poll -> result pattern as the main surah export (see
// routes/export.js's /surah/jobs) rather than blocking a request open.
router.post('/background-video/generate', (req, res) => {
  const { prompt, aspectRatio, durationSeconds } = req.body ?? {};
  const { backgroundUploadsDir, tmpDir } = req.app.locals;

  const job = createJob();
  res.status(202).json({ jobId: job.id, status: job.status });

  updateJob(job.id, { status: 'running', stage: 'generating', progress: 0 });
  generateBackgroundVideo({
    prompt,
    aspectRatio,
    durationSeconds,
    uploadsDir: backgroundUploadsDir,
    tmpDir,
    onProgress: (fraction) => updateJob(job.id, { stage: 'generating', progress: fraction }),
  })
    .then(({ clipId, width, height, durationSeconds }) => {
      updateJob(job.id, {
        status: 'done',
        stage: 'done',
        progress: 1,
        result: { clipId, url: `/uploads/backgrounds/${clipId}`, width, height, durationSeconds },
      });
    })
    .catch((err) => {
      console.error('[uploads] background video generation failed:', err);
      updateJob(job.id, { status: 'error', error: err.message ?? String(err) });
    });
});

router.get('/background-video/generate/jobs/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

export default router;
