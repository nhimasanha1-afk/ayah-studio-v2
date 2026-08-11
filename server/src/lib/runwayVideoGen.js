import RunwayML from '@runwayml/sdk';
import { persistBackgroundVideoUpload } from './backgroundVideoUpload.js';

// gen4.5 text-to-video: promptText <= 1000 UTF-16 units, duration is an
// integer 2-10 seconds, ratio is exactly '1280:720' or '720:1280' -- which
// happens to line up exactly with this app's two supported aspect ratios.
const RATIO_BY_ASPECT_RATIO = { '16:9': '1280:720', '9:16': '720:1280' };
const MAX_PROMPT_LENGTH = 1000;
const MIN_DURATION_SECONDS = 2;
const MAX_DURATION_SECONDS = 10;

// Runway's own docs say not to expect task updates more than once every 5s.
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export function ratioForAspectRatio(aspectRatio) {
  const ratio = RATIO_BY_ASPECT_RATIO[aspectRatio];
  if (!ratio) {
    throw new Error(
      `Unsupported aspectRatio for AI background generation: "${aspectRatio}". Options: ${Object.keys(RATIO_BY_ASPECT_RATIO).join(', ')}`
    );
  }
  return ratio;
}

function defaultClient() {
  const apiKey = process.env.RUNWAYML_API_SECRET;
  if (!apiKey) {
    throw new Error(
      'RUNWAYML_API_SECRET is not set -- AI background video generation requires a real Runway API key (see .env.example).'
    );
  }
  return new RunwayML({ apiKey });
}

/**
 * Generates a background video from a text prompt via Runway's gen4.5
 * text-to-video model, then persists it through the exact same
 * ffprobe-validated storage path as a manually uploaded clip
 * (backgroundVideoUpload.js's persistBackgroundVideoUpload) -- Runway's
 * output URLs expire within 24-48 hours, so "genuinely persisted, not just
 * kept in memory" means downloading and saving the bytes ourselves
 * immediately, not just storing that temporary URL.
 *
 * Polls client.tasks.retrieve() manually (rather than the SDK's opaque
 * waitForTaskOutput helper) so the real progress fraction Runway reports on
 * RUNNING tasks can be surfaced via onProgress -- consistent with this
 * project's rule elsewhere (composeVideo's real ffmpeg -progress parsing)
 * that progress is never fabricated for a stage that can't be measured.
 */
export async function generateBackgroundVideo({
  prompt,
  aspectRatio,
  durationSeconds = 5,
  uploadsDir,
  tmpDir,
  onProgress,
  client = defaultClient(),
  fetchImpl = fetch,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('A non-empty prompt is required.');
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Prompt is too long (max ${MAX_PROMPT_LENGTH} characters).`);
  }
  const duration = Math.round(durationSeconds);
  if (duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
    throw new Error(`durationSeconds must be an integer from ${MIN_DURATION_SECONDS} to ${MAX_DURATION_SECONDS}.`);
  }
  const ratio = ratioForAspectRatio(aspectRatio);

  const task = await client.textToVideo.create({
    model: 'gen4.5',
    promptText: prompt,
    duration,
    ratio,
  });

  const deadline = Date.now() + timeoutMs;
  let result;
  while (true) {
    const status = await client.tasks.retrieve(task.id);
    if (status.status === 'SUCCEEDED') {
      result = status;
      break;
    }
    if (status.status === 'FAILED') {
      throw new Error(`Runway generation failed: ${status.failure ?? 'unknown error'}`);
    }
    if (status.status === 'CANCELLED') {
      throw new Error('Runway generation was cancelled.');
    }
    if (status.status === 'RUNNING' && typeof status.progress === 'number') {
      onProgress?.(status.progress);
    }
    if (Date.now() >= deadline) {
      throw new Error(`Runway generation timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const outputUrl = result.output?.[0];
  if (!outputUrl) {
    throw new Error('Runway task succeeded but returned no output URL.');
  }

  const videoRes = await fetchImpl(outputUrl);
  if (!videoRes.ok) {
    throw new Error(`Failed to download generated video (${videoRes.status} ${videoRes.statusText}).`);
  }
  const buffer = Buffer.from(await videoRes.arrayBuffer());

  const persisted = await persistBackgroundVideoUpload(buffer, uploadsDir, tmpDir);
  return { ...persisted, taskId: task.id, prompt };
}
