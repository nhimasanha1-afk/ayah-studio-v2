import { useEffect, useRef, useState } from 'react';
import { getExportJob, startExportJob, type ExportJob, type ExportStage } from '../lib/backendApi';
import { useExportConfigStore } from '../state/exportConfigStore';

const STAGE_LABELS: Record<ExportStage, string> = {
  'fetching-data': 'Fetching Quran data…',
  'downloading-audio': 'Downloading recitation audio…',
  'preparing-captions': 'Preparing captions…',
  'downloading-background': 'Downloading background clips…',
  encoding: 'Encoding video…',
  probing: 'Finalizing…',
  done: 'Done',
};

const POLL_INTERVAL_MS = 1000;

type UiState = { kind: 'idle' } | { kind: 'polling'; job: ExportJob } | { kind: 'error'; message: string };

export function ExportBar() {
  const chapterId = useExportConfigStore((s) => s.chapterId);
  const reciterId = useExportConfigStore((s) => s.reciterId);
  const translationId = useExportConfigStore((s) => s.translationId);
  const style = useExportConfigStore((s) => s.style);
  const intro = useExportConfigStore((s) => s.intro);
  const outro = useExportConfigStore((s) => s.outro);
  const background = useExportConfigStore((s) => s.background);
  const audioSync = useExportConfigStore((s) => s.audioSync);
  const captionTiming = useExportConfigStore((s) => s.captionTiming);
  const resolution = useExportConfigStore((s) => s.resolution);
  const aspectRatio = useExportConfigStore((s) => s.aspectRatio);

  const [state, setState] = useState<UiState>({ kind: 'idle' });
  const pollHandle = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollHandle.current !== null) window.clearTimeout(pollHandle.current);
    };
  }, []);

  function pollJob(jobId: string) {
    getExportJob(jobId)
      .then((job) => {
        setState({ kind: 'polling', job });
        if (job.status === 'queued' || job.status === 'running') {
          pollHandle.current = window.setTimeout(() => pollJob(jobId), POLL_INTERVAL_MS);
        }
      })
      .catch((err) => setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) }));
  }

  async function handleExport() {
    setState({ kind: 'polling', job: { id: '', status: 'queued', stage: null, progress: null, result: null, error: null } });
    try {
      const { jobId } = await startExportJob({
        chapterId,
        reciterId,
        translationId,
        style,
        intro,
        outro,
        background,
        audioSync,
        captionTiming,
        resolution,
        aspectRatio,
      });
      pollJob(jobId);
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  const isBusy = state.kind === 'polling' && state.job.status !== 'done' && state.job.status !== 'error';
  const job = state.kind === 'polling' ? state.job : null;

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={isBusy}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isBusy ? 'Exporting…' : 'Export video'}
        </button>

        {isBusy && job && (
          <div className="flex-1 space-y-1">
            <p className="text-xs text-neutral-400">
              {job.stage ? STAGE_LABELS[job.stage] : 'Starting…'}
              {job.stage === 'encoding' && job.progress !== null && ` ${Math.round(job.progress * 100)}%`}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: job.stage === 'encoding' && job.progress !== null ? `${job.progress * 100}%` : '100%',
                  opacity: job.stage === 'encoding' ? 1 : 0.4,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {state.kind === 'error' && <p className="text-sm text-red-400">Export failed: {state.message}</p>}
      {job?.status === 'error' && <p className="text-sm text-red-400">Export failed at "{job.stage}": {job.error}</p>}

      {job?.status === 'done' && job.result && (
        <div className="space-y-2 text-sm">
          <p className="text-emerald-400">
            Done — {job.result.probe.durationSeconds.toFixed(1)}s, {job.result.probe.video?.width}×
            {job.result.probe.video?.height}, {(job.result.probe.sizeBytes / 1024 / 1024).toFixed(1)} MB
          </p>
          {job.result.anyEstimatedTiming && (
            <p className="text-amber-400 text-xs">
              Note: some verse timing was estimated (real per-word data wasn't available for every verse).
            </p>
          )}
          <video controls className="w-full rounded-md border border-neutral-800" src={job.result.downloadUrl} />
          <div className="flex gap-2">
            <a
              href={job.result.downloadUrl}
              download
              className="inline-block rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
            >
              Download {job.result.filename}
            </a>
            <a
              href={job.result.srtDownloadUrl}
              download
              className="inline-block rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
            >
              Download captions (.srt)
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
