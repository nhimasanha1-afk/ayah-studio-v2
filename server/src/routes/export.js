import { Router } from 'express';
import path from 'node:path';
import { probe } from '../lib/ffmpeg.js';
import { runTestExport, testExportPath } from '../lib/testExport.js';
import { runSurahExport, DEFAULT_RECITER_ID, DEFAULT_TRANSLATION_ID } from '../lib/surahExport.js';
import { fetchChapter, fetchVerses, fetchReciterAudioFile } from '../lib/quranApi.js';
import { buildCaptionData } from '../lib/captionData.js';
import { BACKGROUND_LIBRARY } from '../lib/backgroundLibrary.js';
import { createJob, getJob, updateJob } from '../lib/jobQueue.js';
import { cleanupOldOutputs, enforceOutputSizeCap } from '../lib/outputCleanup.js';

const router = Router();

router.get('/backgrounds', (req, res) => {
  res.json({ categories: BACKGROUND_LIBRARY });
});

// Real, word-synced timing data for the live browser preview player --
// deliberately just the data-fetching half of the real export pipeline
// (fetchChapter/fetchVerses/fetchReciterAudioFile + buildCaptionData, the
// exact same functions runSurahExport uses), with no ffmpeg step at all.
// The browser plays the real recitation audio directly from its CDN URL
// (a plain <audio src> load, not a fetch(), so no CORS concerns) and
// renders captions itself in sync with real playback time -- accurate,
// not an approximation, for the parts it covers (word highlighting,
// per-verse translation, real duration/scrubbing, and now the real
// Bismillah audio + its real cut boundary, so the client can build a
// genuine intro-window playback phase too). Background crossfades and the
// intro/outro cards' own custom background media are still export-only
// compositing, not reproduced pixel-for-pixel here.
router.get('/preview-data', async (req, res) => {
  try {
    const chapterId = Number(req.query.chapterId ?? 112);
    const reciterId = req.query.reciterId ? Number(req.query.reciterId) : DEFAULT_RECITER_ID;
    const translationId = req.query.translationId ? Number(req.query.translationId) : DEFAULT_TRANSLATION_ID;

    const [chapter, verses, audioFile] = await Promise.all([
      fetchChapter(chapterId),
      fetchVerses(chapterId, translationId),
      fetchReciterAudioFile(reciterId, chapterId),
    ]);
    const captionData = buildCaptionData({ verses, audioFile });

    // Bismillah has no standalone audio file -- it's verse 1 of Al-Fatiha
    // (mirrors bismillahAudio.js's server-export logic). For the preview we
    // don't need to download/crop anything: the reciter's real Al-Fatiha
    // CDN URL is directly playable by the browser, and the real
    // forced-alignment boundary where verse 2 begins (never verse 1's own
    // end-timestamp, which can be short of the true audio) tells the client
    // exactly when to stop it. Reuses the already-fetched audioFile when the
    // selected chapter IS Al-Fatiha, instead of a redundant second fetch.
    const bismillahSourceFile = chapterId === 1 ? audioFile : await fetchReciterAudioFile(reciterId, 1);
    const verse2Timing = bismillahSourceFile.verse_timings?.find((vt) => vt.verse_key === '1:2');

    res.json({
      chapter: {
        id: chapter.id,
        nameSimple: chapter.name_simple,
        nameArabic: chapter.name_arabic,
        translatedName: chapter.translated_name.name,
      },
      audioUrl: audioFile.audio_url,
      bismillahAudioUrl: bismillahSourceFile.audio_url,
      bismillahAudioDurationMs: verse2Timing ? verse2Timing.timestamp_from : null,
      anyEstimatedTiming: captionData.anyEstimated,
      verses: captionData.verses.map((v) => ({
        verseKey: v.verseKey,
        verseNumber: v.verseNumber,
        startMs: v.startMs,
        endMs: v.endMs,
        translationText: v.translationText,
        isEstimated: v.isEstimated,
        words: v.words.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })),
      })),
    });
  } catch (err) {
    console.error('[export] preview-data failed:', err);
    res.status(500).json({ error: err.message ?? String(err) });
  }
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

  // Defensive sweep right before writing a new, potentially large (100MB+)
  // file -- on top of the periodic sweep in index.js, so a burst of exports
  // in quick succession can't outrun the hourly interval and hit "No space
  // left on device" again. Size cap runs alongside the age-based sweep since
  // a burst of recent exports can blow the disk before any of them age out.
  cleanupOldOutputs(outputDir);
  enforceOutputSizeCap(outputDir);

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
