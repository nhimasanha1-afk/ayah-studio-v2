import { Router } from 'express';
import path from 'node:path';
import { probe } from '../lib/ffmpeg.js';
import { runTestExport, testExportPath } from '../lib/testExport.js';
import { runSurahExport } from '../lib/surahExport.js';
import { BACKGROUND_LIBRARY } from '../lib/backgroundLibrary.js';
import { createJob, getJob, updateJob } from '../lib/jobQueue.js';

const router = Router();

router.get('/backgrounds', (req, res) => {
  res.json({ categories: BACKGROUND_LIBRARY });
});

router.post('/test-export', async (req, res) => {
  const outputDir = req.app.locals.outputDir;
  const outputPath = testExportPath(outputDir);
  const filename = path.basename(outputPath);

  try {
    await runTestExport(outputPath);
    const info = await probe(outputPath);
    const videoStream = info.streams.find((s) => s.codec_type === 'video');
    const audioStream = info.streams.find((s) => s.codec_type === 'audio');

    res.json({
      success: true,
      filename,
      downloadUrl: `/output/${filename}`,
      probe: {
        durationSeconds: Number(info.format.duration),
        sizeBytes: Number(info.format.size),
        video: videoStream
          ? { codec: videoStream.codec_name, width: videoStream.width, height: videoStream.height }
          : null,
        audio: audioStream ? { codec: audioStream.codec_name } : null,
      },
    });
  } catch (err) {
    console.error('[export] test-export failed:', err);
    res.status(500).json({ success: false, error: err.message ?? String(err) });
  }
});

function surahExportOptionsFromBody(body, outputPath) {
  return {
    chapterId: Number(body?.chapterId ?? 112),
    reciterId: body?.reciterId ? Number(body.reciterId) : undefined,
    translationId: body?.translationId ? Number(body.translationId) : undefined,
    translationLanguage: body?.translationLanguage,
    outputPath,
    style: body?.style ?? {},
    intro: body?.intro ?? {},
    outro: body?.outro ?? {},
    background: body?.background ?? {},
    audioSync: body?.audioSync ?? {},
    captionTiming: body?.captionTiming ?? {},
    resolution: body?.resolution ?? '720p',
    aspectRatio: body?.aspectRatio ?? '16:9',
  };
}

function formatSurahResult(result, filename) {
  const outStreams = result.outputProbe.streams;
  const videoStream = outStreams.find((s) => s.codec_type === 'video');
  const audioStream = outStreams.find((s) => s.codec_type === 'audio');

  return {
    success: true,
    filename,
    downloadUrl: `/output/${filename}`,
    srtDownloadUrl: `/output/${filename.replace(/\.mp4$/, '.srt')}`,
    chapter: {
      id: result.chapter.id,
      nameSimple: result.chapter.name_simple,
      nameArabic: result.chapter.name_arabic,
    },
    audioSourceUrl: result.audioSourceUrl,
    audioSyncOffsetMs: result.audioSyncOffsetMs,
    resolution: result.resolution,
    aspectRatio: result.aspectRatio,
    introWindow: result.introWindow,
    outroWindow: result.outroWindow,
    anyEstimatedTiming: result.captionData.anyEstimated,
    verses: result.captionData.verses.map((v) => ({
      verseKey: v.verseKey,
      startMs: v.startMs,
      endMs: v.endMs,
      wordCount: v.words.length,
      isEstimated: v.isEstimated,
    })),
    probe: {
      durationSeconds: Number(result.outputProbe.format.duration),
      sizeBytes: Number(result.outputProbe.format.size),
      video: videoStream
        ? { codec: videoStream.codec_name, width: videoStream.width, height: videoStream.height }
        : null,
      audio: audioStream ? { codec: audioStream.codec_name } : null,
    },
  };
}

// Synchronous export -- kept for quick scripts/testing. Real-world-length
// exports should use the job-based endpoints below instead, since this one
// blocks the request for the full render.
router.post('/surah', async (req, res) => {
  const outputDir = req.app.locals.outputDir;
  const chapterId = Number(req.body?.chapterId ?? 112);
  const filename = `surah-${chapterId}-${Date.now()}.mp4`;
  const outputPath = path.join(outputDir, filename);

  try {
    const result = await runSurahExport(surahExportOptionsFromBody(req.body, outputPath));
    res.json(formatSurahResult(result, filename));
  } catch (err) {
    console.error('[export] surah export failed:', err);
    res.status(500).json({ success: false, error: err.message ?? String(err) });
  }
});

// Async job pattern: start job -> poll status -> download result. Use this
// for real-world-length exports so the request doesn't have to stay open
// for the whole render.
router.post('/surah/jobs', (req, res) => {
  const outputDir = req.app.locals.outputDir;
  const chapterId = Number(req.body?.chapterId ?? 112);
  const filename = `surah-${chapterId}-${Date.now()}.mp4`;
  const outputPath = path.join(outputDir, filename);

  const job = createJob();
  res.status(202).json({ jobId: job.id, status: job.status });

  updateJob(job.id, { status: 'running' });
  runSurahExport({
    ...surahExportOptionsFromBody(req.body, outputPath),
    onProgress: (stage, progress) => updateJob(job.id, { stage, progress }),
  })
    .then((result) => {
      updateJob(job.id, { status: 'done', stage: 'done', progress: 1, result: formatSurahResult(result, filename) });
    })
    .catch((err) => {
      console.error('[export] surah job failed:', err);
      updateJob(job.id, { status: 'error', error: err.message ?? String(err) });
    });
});

router.get('/surah/jobs/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

export default router;
