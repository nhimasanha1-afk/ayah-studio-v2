import { useEffect, useRef, useState } from 'react';
import {
  generateBackgroundVideo,
  getBackgroundVideoGenerationJob,
  type BackgroundVideoGenerationJob,
} from '../../lib/backendApi';
import { useExportConfigStore } from '../../state/exportConfigStore';

const POLL_INTERVAL_MS = 3000;
const MAX_PROMPT_LENGTH = 1000;

type UiState = { kind: 'idle' } | { kind: 'polling'; job: BackgroundVideoGenerationJob } | { kind: 'error'; message: string };

export function BackgroundVideoGenerateField() {
  const aspectRatio = useExportConfigStore((s) => s.aspectRatio);
  const addUploadedBackgroundClip = useExportConfigStore((s) => s.addUploadedBackgroundClip);
  const toggleClipInPool = useExportConfigStore((s) => s.toggleClipInPool);

  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<UiState>({ kind: 'idle' });
  const pollHandle = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollHandle.current !== null) window.clearTimeout(pollHandle.current);
    };
  }, []);

  function pollJob(jobId: string) {
    getBackgroundVideoGenerationJob(jobId)
      .then((job) => {
        setState({ kind: 'polling', job });
        if (job.status === 'queued' || job.status === 'running') {
          pollHandle.current = window.setTimeout(() => pollJob(jobId), POLL_INTERVAL_MS);
        } else if (job.status === 'done' && job.result) {
          addUploadedBackgroundClip({ id: job.result.clipId, title: prompt || 'AI generated' });
          toggleClipInPool(job.result.clipId);
        }
      })
      .catch((err) => setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) }));
  }

  async function handleGenerate() {
    setState({ kind: 'polling', job: { id: '', status: 'queued', stage: null, progress: null, result: null, error: null } });
    try {
      const { jobId } = await generateBackgroundVideo(prompt, aspectRatio);
      pollJob(jobId);
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  const isBusy = state.kind === 'polling' && state.job.status !== 'done' && state.job.status !== 'error';
  const job = state.kind === 'polling' ? state.job : null;

  return (
    <div className="space-y-1.5 rounded-md border border-neutral-800 p-2.5">
      <span className="text-xs font-medium text-neutral-400">Generate background with AI</span>
      <textarea
        className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
        rows={2}
        maxLength={MAX_PROMPT_LENGTH}
        placeholder="e.g. slow aerial drift over misty green mountains at dawn"
        value={prompt}
        disabled={isBusy}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isBusy || prompt.trim().length === 0}
          className="rounded-md bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isBusy ? 'Generating…' : 'Generate'}
        </button>
        <span className="text-[11px] text-neutral-500">{prompt.length}/{MAX_PROMPT_LENGTH}</span>
      </div>

      {isBusy && job && (
        <div className="space-y-1">
          <p className="text-xs text-neutral-400">
            {job.stage === 'generating' && job.progress !== null
              ? `Generating… ${Math.round(job.progress * 100)}%`
              : 'Starting…'}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{
                width: job.progress !== null ? `${job.progress * 100}%` : '30%',
                opacity: job.progress !== null ? 1 : 0.4,
              }}
            />
          </div>
          <p className="text-[11px] text-neutral-500">
            AI generation can take a few minutes; feel free to keep adjusting other settings.
          </p>
        </div>
      )}

      {state.kind === 'error' && <p className="text-xs text-red-400">{state.message}</p>}
      {job?.status === 'error' && <p className="text-xs text-red-400">{job.error}</p>}
      {job?.status === 'done' && <p className="text-xs text-emerald-400">Added to your uploaded clips and rotation pool.</p>}
    </div>
  );
}
