import type {
  AspectRatio,
  AudioSyncConfig,
  BackgroundConfig,
  BackgroundLibrary,
  CaptionTimingConfig,
  IntroConfig,
  OutroConfig,
  Resolution,
  StyleConfig,
} from './types';

export interface SurahExportRequest {
  chapterId: number;
  reciterId?: number;
  translationId?: number;
  translationLanguage?: string;
  style: StyleConfig;
  intro: IntroConfig;
  outro: OutroConfig;
  background: BackgroundConfig;
  audioSync: AudioSyncConfig;
  captionTiming: CaptionTimingConfig;
  resolution: Resolution;
  aspectRatio: AspectRatio;
}

export interface SurahExportResult {
  success: true;
  filename: string;
  downloadUrl: string;
  srtDownloadUrl: string;
  chapter: { id: number; nameSimple: string; nameArabic: string };
  audioSourceUrl: string;
  introWindow: { windowMs: number; startMs: number; endMs: number };
  outroWindow: { enabled: boolean; startSec?: number; durationSec?: number; line1?: string; line2?: string };
  anyEstimatedTiming: boolean;
  verses: { verseKey: string; startMs: number | null; endMs: number | null; wordCount: number; isEstimated: boolean }[];
  probe: {
    durationSeconds: number;
    sizeBytes: number;
    video: { codec: string; width: number; height: number } | null;
    audio: { codec: string } | null;
  };
}

// Mirrors server/src/lib/jobQueue.js. `stage` is one of the real pipeline
// stages (fetching-data, downloading-audio, preparing-captions,
// downloading-background, encoding, probing, done); `progress` is a real
// 0-1 fraction only during "encoding" (parsed from ffmpeg's own -progress
// output), null otherwise -- there's no fabricated percentage for stages
// that can't be measured.
export type ExportStage =
  | 'fetching-data'
  | 'downloading-audio'
  | 'preparing-captions'
  | 'downloading-background'
  | 'encoding'
  | 'probing'
  | 'done';

export interface ExportJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  stage: ExportStage | null;
  progress: number | null;
  result: SurahExportResult | null;
  error: string | null;
}

export async function fetchBackgroundLibrary(): Promise<BackgroundLibrary> {
  const res = await fetch('/api/export/backgrounds');
  if (!res.ok) throw new Error(`Failed to load background library (${res.status})`);
  const data = (await res.json()) as { categories: BackgroundLibrary };
  return data.categories;
}

export interface PreviewWord {
  text: string;
  startMs: number | null;
  endMs: number | null;
}

export interface PreviewVerseTiming {
  verseKey: string;
  verseNumber: number;
  startMs: number | null;
  endMs: number | null;
  translationText: string;
  isEstimated: boolean;
  words: PreviewWord[];
}

// Mirrors server/src/routes/export.js's /preview-data -- the exact same
// fetchChapter/fetchVerses/fetchReciterAudioFile + buildCaptionData used by
// the real export, just without the ffmpeg step. Real word-synced timing
// and a real playable audio URL for the whole chapter, not an
// approximation of just the first verse.
export interface PreviewData {
  chapter: { id: number; nameSimple: string; nameArabic: string; translatedName: string };
  audioUrl: string;
  // Bismillah has no standalone audio file -- it's verse 1 of Al-Fatiha, so
  // this is that reciter's real Al-Fatiha CDN URL plus the real
  // forced-alignment boundary (ms) where verse 2 begins. The client plays
  // this audio from 0 and stops it at bismillahAudioDurationMs, the same
  // real cut point server/src/lib/bismillahAudio.js uses for the export.
  bismillahAudioUrl: string;
  bismillahAudioDurationMs: number | null;
  anyEstimatedTiming: boolean;
  verses: PreviewVerseTiming[];
}

export async function fetchPreviewData(chapterId: number, reciterId: number, translationId: number): Promise<PreviewData> {
  const params = new URLSearchParams({
    chapterId: String(chapterId),
    reciterId: String(reciterId),
    translationId: String(translationId),
  });
  const res = await fetch(`/api/export/preview-data?${params}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to load preview data (${res.status})`);
  }
  return res.json() as Promise<PreviewData>;
}

export interface LogoUploadResult {
  logoId: string;
  url: string;
  width: number;
  height: number;
}

export async function uploadChannelLogo(file: File): Promise<LogoUploadResult> {
  const formData = new FormData();
  formData.append('logo', file);
  const res = await fetch('/api/uploads/logo', { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }
  return data as LogoUploadResult;
}

export interface CardImageUploadResult {
  imageId: string;
  url: string;
  width: number;
  height: number;
}

export async function uploadCardImage(file: File): Promise<CardImageUploadResult> {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/uploads/card-image', { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }
  return data as CardImageUploadResult;
}

export interface BackgroundVideoUploadResult {
  clipId: string;
  url: string;
  width: number;
  height: number;
  durationSeconds: number;
}

export async function uploadBackgroundVideo(file: File): Promise<BackgroundVideoUploadResult> {
  const formData = new FormData();
  formData.append('video', file);
  const res = await fetch('/api/uploads/background-video', { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }
  return data as BackgroundVideoUploadResult;
}

export interface BackgroundVideoGenerationResult {
  clipId: string;
  url: string;
  width: number;
  height: number;
  durationSeconds: number;
}

// Mirrors server/src/lib/jobQueue.js again -- same generic job shape as
// ExportJob, reused for the Runway generation job since it's a real,
// multi-minute external call and follows the identical
// start-job/poll/result pattern. `progress` is Runway's own real reported
// fraction (server/src/lib/runwayVideoGen.js polls client.tasks.retrieve()
// itself rather than trusting an opaque wait helper, precisely so this
// isn't a fabricated percentage).
export interface BackgroundVideoGenerationJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  stage: 'generating' | 'done' | null;
  progress: number | null;
  result: BackgroundVideoGenerationResult | null;
  error: string | null;
}

export async function generateBackgroundVideo(
  prompt: string,
  aspectRatio: AspectRatio,
  durationSeconds?: number
): Promise<{ jobId: string }> {
  const res = await fetch('/api/uploads/background-video/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, aspectRatio, durationSeconds }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to start generation (${res.status})`);
  }
  const data = (await res.json()) as { jobId: string; status: string };
  return { jobId: data.jobId };
}

export async function getBackgroundVideoGenerationJob(jobId: string): Promise<BackgroundVideoGenerationJob> {
  const res = await fetch(`/api/uploads/background-video/generate/jobs/${jobId}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to fetch job status (${res.status})`);
  }
  return res.json() as Promise<BackgroundVideoGenerationJob>;
}

export interface CardImageGenerationResult {
  imageId: string;
  url: string;
  width: number;
  height: number;
}

// Same generic job shape as BackgroundVideoGenerationJob, for Runway's
// gen4_image text-to-image model instead of text-to-video.
export interface CardImageGenerationJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  stage: 'generating' | 'done' | null;
  progress: number | null;
  result: CardImageGenerationResult | null;
  error: string | null;
}

export async function generateCardImage(prompt: string, aspectRatio: AspectRatio): Promise<{ jobId: string }> {
  const res = await fetch('/api/uploads/card-image/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, aspectRatio }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to start generation (${res.status})`);
  }
  const data = (await res.json()) as { jobId: string; status: string };
  return { jobId: data.jobId };
}

export async function getCardImageGenerationJob(jobId: string): Promise<CardImageGenerationJob> {
  const res = await fetch(`/api/uploads/card-image/generate/jobs/${jobId}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to fetch job status (${res.status})`);
  }
  return res.json() as Promise<CardImageGenerationJob>;
}

export async function startExportJob(request: SurahExportRequest): Promise<{ jobId: string }> {
  const res = await fetch('/api/export/surah/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to start export (${res.status})`);
  }
  const data = (await res.json()) as { jobId: string; status: string };
  return { jobId: data.jobId };
}

export async function getExportJob(jobId: string): Promise<ExportJob> {
  const res = await fetch(`/api/export/surah/jobs/${jobId}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Failed to fetch job status (${res.status})`);
  }
  return res.json() as Promise<ExportJob>;
}
