import { useEffect, useRef, useState } from 'react';
import { getExportJob, startExportJob, JobStatusFetchError, type ExportJob, type ExportStage } from '../lib/backendApi';
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
// A real 4K/many-clip export can run for hours (measured up to ~2.5h in
// production), polling every second the whole time -- thousands of
// requests, so a single transient network blip (WiFi drop, laptop sleep,
// tab throttling) is near-guaranteed to happen at least once. Backing off
// and retrying through those blips (instead of failing outright) avoids a
// real reported bug: the export was still running (or had already finished)
// server-side, but the UI reported "Export failed: Failed to fetch" from
// one bad poll and the user never got a chance to download the real result.
const MAX_POLL_BACKOFF_MS = 15000;
// Keeps tracking a still-running export across a page reload/close+reopen --
// otherwise a multi-hour job silently outlives the only place its jobId was
// held (React state), and the user has no way back to it.
const ACTIVE_JOB_STORAGE_KEY = 'ayah-studio:active-export-job-id';

type UiState =
  | { kind: 'idle' }
  | { kind: 'polling'; job: ExportJob; reconnecting: boolean }
  | { kind: 'error'; message: string };

export function ExportBar() {
  const chapterId = useExportConfigStore((s) => s.chapterId);
  const reciterId = useExportConfigStore((s) => s.reciterId);
  const translationId = useExportConfigStore((s) => s.translationId);
  const translationLanguage = useExportConfigStore((s) => s.translationLanguage);
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
    // Resume tracking a still-running export left over from before a reload
    // -- see ACTIVE_JOB_STORAGE_KEY's comment.
    const savedJobId = localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
    if (savedJobId) {
      setState({
        kind: 'polling',
        job: { id: savedJobId, status: 'queued', stage: null, progress: null, result: null, error: null },
        reconnecting: false,
      });
      pollJob(savedJobId);
    }
    return () => {
      if (pollHandle.current !== null) window.clearTimeout(pollHandle.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pollJob(jobId: string, backoffMs = POLL_INTERVAL_MS) {
    getExportJob(jobId)
      .then((job) => {
        setState({ kind: 'polling', job, reconnecting: false });
        if (job.status === 'queued' || job.status === 'running') {
          pollHandle.current = window.setTimeout(() => pollJob(jobId, POLL_INTERVAL_MS), POLL_INTERVAL_MS);
        } else {
          localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
        }
      })
      .catch((err) => {
        // Two distinct transient cases, both worth retrying through rather
        // than reporting a false failure: fetch() itself throwing a
        // TypeError (connection dropped, offline, DNS blip -- no HTTP
        // response at all), and a 5xx from the server/proxy (a backend
        // hiccup or mid-restart gap -- confirmed live: a dev-server restart
        // produced a real 502 on the very next poll after a job started).
        // Anything else (404 "Job not found" after a deploy wiped the
        // in-memory job store, etc.) means the server responded clearly and
        // retrying can't fix it, so it's reported immediately.
        const isTransient = err instanceof TypeError || (err instanceof JobStatusFetchError && err.status >= 500);
        if (isTransient) {
          setState((prev) => (prev.kind === 'polling' ? { ...prev, reconnecting: true } : prev));
          const nextBackoff = Math.min(backoffMs * 2, MAX_POLL_BACKOFF_MS);
          pollHandle.current = window.setTimeout(() => pollJob(jobId, nextBackoff), backoffMs);
          return;
        }
        localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
  }

  async function handleExport() {
    setState({
      kind: 'polling',
      job: { id: '', status: 'queued', stage: null, progress: null, result: null, error: null },
      reconnecting: false,
    });
    try {
      const { jobId } = await startExportJob({
        chapterId,
        reciterId,
        translationId,
        translationLanguage,
        style,
        intro,
        outro,
        background,
        audioSync,
        captionTiming,
        resolution,
        aspectRatio,
      });
      localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, jobId);
      pollJob(jobId);
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  const isBusy = state.kind === 'polling' && state.job.status !== 'done' && state.job.status !== 'error';
  const job = state.kind === 'polling' ? state.job : null;
  const reconnecting = state.kind === 'polling' && state.reconnecting;

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
            <p className={`text-xs ${reconnecting ? 'text-amber-400' : 'text-neutral-400'}`}>
              {reconnecting
                ? 'Connection lost, retrying… (export keeps running on the server)'
                : job.stage
                  ? STAGE_LABELS[job.stage]
                  : 'Starting…'}
              {!reconnecting && job.stage === 'encoding' && job.progress !== null && ` ${Math.round(job.progress * 100)}%`}
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
