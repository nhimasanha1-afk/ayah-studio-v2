import RunwayML from '@runwayml/sdk';
import { persistCardImageUpload } from './cardImageUpload.js';

// gen4_image: promptText <= 1000 UTF-16 units, no reference images required
// (unlike gen4_image_turbo, which mandates 1-3 reference images) -- the
// right choice for a plain text-prompt card background. Reuses the exact
// same '1280:720'/'720:1280' ratios as the video model, which happen to
// line up with this app's two supported aspect ratios.
const RATIO_BY_ASPECT_RATIO = { '16:9': '1280:720', '9:16': '720:1280' };
const MAX_PROMPT_LENGTH = 1000;

// Runway's own docs say not to expect task updates more than once every 5s.
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export function ratioForAspectRatio(aspectRatio) {
  const ratio = RATIO_BY_ASPECT_RATIO[aspectRatio];
  if (!ratio) {
    throw new Error(
      `Unsupported aspectRatio for AI image generation: "${aspectRatio}". Options: ${Object.keys(RATIO_BY_ASPECT_RATIO).join(', ')}`
    );
  }
  return ratio;
}

function defaultClient() {
  const apiKey = process.env.RUNWAYML_API_SECRET;
  if (!apiKey) {
    throw new Error(
      'RUNWAYML_API_SECRET is not set -- AI card image generation requires a real Runway API key (see .env.example).'
    );
  }
  return new RunwayML({ apiKey });
}

/**
 * Generates an intro/outro card background image from a text prompt via
 * Runway's gen4_image model, then persists it through the exact same
 * ffprobe-validated storage path as a manually uploaded card image
 * (cardImageUpload.js's persistCardImageUpload) -- Runway's output URLs
 * expire, so downloading and saving the bytes ourselves immediately is what
 * makes this genuinely persisted rather than just a temporary link.
 *
 * Mirrors runwayVideoGen.js's generateBackgroundVideo: manual polling of
 * client.tasks.retrieve() (not the SDK's opaque wait helper) so a real
 * progress fraction can be surfaced, dependency-injectable client/fetchImpl
 * for testing.
 */
export async function generateCardImage({
  prompt,
  aspectRatio,
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
  const ratio = ratioForAspectRatio(aspectRatio);

  const task = await client.textToImage.create({
    model: 'gen4_image',
    promptText: prompt,
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

  const imageRes = await fetchImpl(outputUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to download generated image (${imageRes.status} ${imageRes.statusText}).`);
  }
  const buffer = Buffer.from(await imageRes.arrayBuffer());

  const persisted = await persistCardImageUpload(buffer, uploadsDir, tmpDir);
  return { ...persisted, taskId: task.id, prompt };
}
