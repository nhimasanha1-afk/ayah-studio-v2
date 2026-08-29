import { useEffect, useRef, useState } from 'react';
import {
  generateCardImage,
  getCardImageGenerationJob,
  uploadBackgroundVideo,
  uploadCardImage,
  type CardImageGenerationJob,
} from '../../lib/backendApi';
import { useBackgroundLibrary } from '../../lib/hooks';
import { useExportConfigStore } from '../../state/exportConfigStore';

const POLL_INTERVAL_MS = 3000;
const MAX_PROMPT_LENGTH = 1000;

type GenerateUiState = { kind: 'idle' } | { kind: 'polling'; job: CardImageGenerationJob } | { kind: 'error'; message: string };

/**
 * Single-select media picker for an intro/outro card's own background,
 * shared by IntroPanel and OutroPanel. Reuses the exact same curated
 * library + uploaded-video clip ids as the main BackgroundPanel's rotation
 * pool (a card only ever shows one clip, not a rotation, hence a <select>
 * instead of BackgroundPanel's checkbox list), plus uploaded/AI-generated
 * still images which only make sense for a card, not the main looping
 * background.
 */
export function CardBackgroundPicker({ value, onChange }: { value: string | null; onChange: (clipId: string | null) => void }) {
  const library = useBackgroundLibrary();
  const aspectRatio = useExportConfigStore((s) => s.aspectRatio);
  const uploadedBackgroundClips = useExportConfigStore((s) => s.uploadedBackgroundClips);
  const uploadedCardImages = useExportConfigStore((s) => s.uploadedCardImages);
  const addUploadedBackgroundClip = useExportConfigStore((s) => s.addUploadedBackgroundClip);
  const addUploadedCardImage = useExportConfigStore((s) => s.addUploadedCardImage);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [prompt, setPrompt] = useState('');
  const [genState, setGenState] = useState<GenerateUiState>({ kind: 'idle' });
  const pollHandle = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollHandle.current !== null) window.clearTimeout(pollHandle.current);
    };
  }, []);

  async function handleImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setUploadError(null);
    try {
      const result = await uploadCardImage(file);
      addUploadedCardImage({ id: result.imageId, title: file.name });
      onChange(result.imageId);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }

  async function handleVideoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingVideo(true);
    setUploadError(null);
    try {
      const result = await uploadBackgroundVideo(file);
      addUploadedBackgroundClip({ id: result.clipId, title: file.name });
      onChange(result.clipId);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  }

  function pollJob(jobId: string) {
    getCardImageGenerationJob(jobId)
      .then((job) => {
        setGenState({ kind: 'polling', job });
        if (job.status === 'queued' || job.status === 'running') {
          pollHandle.current = window.setTimeout(() => pollJob(jobId), POLL_INTERVAL_MS);
        } else if (job.status === 'done' && job.result) {
          addUploadedCardImage({ id: job.result.imageId, title: prompt || 'AI generated' });
          onChange(job.result.imageId);
        }
      })
      .catch((err) => setGenState({ kind: 'error', message: err instanceof Error ? err.message : String(err) }));
  }

  async function handleGenerate() {
    setGenState({ kind: 'polling', job: { id: '', status: 'queued', stage: null, progress: null, result: null, error: null } });
    try {
      const { jobId } = await generateCardImage(prompt, aspectRatio);
      pollJob(jobId);
    } catch (err) {
      setGenState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  const isGenerating = genState.kind === 'polling' && genState.job.status !== 'done' && genState.job.status !== 'error';
  const genJob = genState.kind === 'polling' ? genState.job : null;

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-neutral-400">Card background</span>
      <select
        className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Main background (default)</option>

        {(uploadedCardImages.length > 0 || uploadedBackgroundClips.length > 0) && (
          <optgroup label="Your uploads">
            {uploadedCardImages.map((img) => (
              <option key={img.id} value={img.id}>
                {img.title}
              </option>
            ))}
            {uploadedBackgroundClips.map((clip) => (
              <option key={clip.id} value={clip.id}>
                {clip.title}
              </option>
            ))}
          </optgroup>
        )}

        {library.data &&
          Object.entries(library.data).map(([category, clips]) => (
            <optgroup key={category} label={category}>
              {clips.map((clip) => (
                <option key={clip.id} value={clip.id}>
                  {clip.title}
                </option>
              ))}
            </optgroup>
          ))}
      </select>

      <div className="flex flex-wrap gap-1.5">
        <label className="inline-block cursor-pointer rounded-md bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700">
          {uploadingImage ? 'Uploading…' : 'Upload image'}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={uploadingImage}
            onChange={handleImageFileChange}
          />
        </label>
        <label className="inline-block cursor-pointer rounded-md bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700">
          {uploadingVideo ? 'Uploading…' : 'Upload video'}
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska"
            className="hidden"
            disabled={uploadingVideo}
            onChange={handleVideoFileChange}
          />
        </label>
      </div>
      {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}

      <div className="space-y-1.5 rounded-md border border-neutral-800 p-2.5">
        <span className="text-xs font-medium text-neutral-400">Generate image with AI</span>
        <textarea
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
          rows={2}
          maxLength={MAX_PROMPT_LENGTH}
          placeholder="e.g. an ornate golden Islamic geometric pattern on a dark background"
          value={prompt}
          disabled={isGenerating}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || prompt.trim().length === 0}
            className="rounded-md bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating…' : 'Generate'}
          </button>
          <span className="text-[11px] text-neutral-500">{prompt.length}/{MAX_PROMPT_LENGTH}</span>
        </div>

        {isGenerating && genJob && (
          <div className="space-y-1">
            <p className="text-xs text-neutral-400">
              {genJob.stage === 'generating' && genJob.progress !== null
                ? `Generating… ${Math.round(genJob.progress * 100)}%`
                : 'Starting…'}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: genJob.progress !== null ? `${genJob.progress * 100}%` : '30%',
                  opacity: genJob.progress !== null ? 1 : 0.4,
                }}
              />
            </div>
          </div>
        )}

        {genState.kind === 'error' && <p className="text-xs text-red-400">{genState.message}</p>}
        {genJob?.status === 'error' && <p className="text-xs text-red-400">{genJob.error}</p>}
        {genJob?.status === 'done' && <p className="text-xs text-emerald-400">Generated and selected for this card.</p>}
        <p className="text-[11px] text-neutral-500">A real, paid Runway generation per image -- takes a few seconds to a minute.</p>
      </div>

      <p className="text-xs text-neutral-500">Shown behind this card only, in place of the main background.</p>
    </div>
  );
}
