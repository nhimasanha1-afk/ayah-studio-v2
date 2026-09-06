import { useState } from 'react';
import { TRANSITION_STYLES } from '../lib/types';
import { useBackgroundLibrary, usePreviewData } from '../lib/hooks';
import { useExportConfigStore } from '../state/exportConfigStore';
import { computeIntroTimingWindow } from '../lib/introTiming';
import { instanceCountForDuration } from '../lib/backgroundRotation';
import { BackgroundVideoGenerateField } from './fields/BackgroundVideoGenerateField';
import { BackgroundVideoUploadField } from './fields/BackgroundVideoUploadField';
import { NumberField } from './fields/NumberField';
import { Panel } from './Panel';
import { SelectField } from './SelectField';

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

// Common real-world clip lengths (many stock/AI-generated background clips
// come in these) -- shown as a quick reference alongside the live estimate
// for whatever "Clip display duration" is currently set to, so switching
// between e.g. 20s and 30s source clips doesn't require moving the slider
// back and forth just to compare counts.
const REFERENCE_CLIP_LENGTHS_SECONDS = [10, 15, 20, 30];

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Round-robins one clip per category per pass so the picks spread evenly
// across whichever categories are featured, instead of a plain random draw
// over the pooled clips which would let a large category (e.g. 20 Ocean
// clips) crowd out a small one. Final order is reshuffled so the round-robin
// pattern isn't visible in the resulting rotation.
function pickRandomAcrossCategories(
  categorized: Record<string, { id: string }[]>,
  featuredCategories: Set<string>,
  count: number
): string[] {
  const categoryNames = Object.keys(categorized).filter(
    (name) => featuredCategories.size === 0 || featuredCategories.has(name)
  );
  const pools = categoryNames.map((name) => shuffled(categorized[name].map((c) => c.id)));

  const picked: string[] = [];
  for (let round = 0; picked.length < count; round++) {
    const roundHadPick = pools.some((pool) => round < pool.length);
    if (!roundHadPick) break;
    for (const pool of pools) {
      if (picked.length >= count) break;
      if (round < pool.length) picked.push(pool[round]);
    }
  }

  return shuffled(picked);
}

export function BackgroundPanel() {
  const library = useBackgroundLibrary();
  const background = useExportConfigStore((s) => s.background);
  const uploadedBackgroundClips = useExportConfigStore((s) => s.uploadedBackgroundClips);
  const chapterId = useExportConfigStore((s) => s.chapterId);
  const reciterId = useExportConfigStore((s) => s.reciterId);
  const translationId = useExportConfigStore((s) => s.translationId);
  const intro = useExportConfigStore((s) => s.intro);
  const outro = useExportConfigStore((s) => s.outro);
  const setBackgroundOrder = useExportConfigStore((s) => s.setBackgroundOrder);
  const setBackgroundTiming = useExportConfigStore((s) => s.setBackgroundTiming);
  const toggleClipInPool = useExportConfigStore((s) => s.toggleClipInPool);
  const toggleClipsInPool = useExportConfigStore((s) => s.toggleClipsInPool);
  const setClipPool = useExportConfigStore((s) => s.setClipPool);
  const moveClipInPool = useExportConfigStore((s) => s.moveClipInPool);
  const reorderClipInPool = useExportConfigStore((s) => s.reorderClipInPool);
  const setPreviewClip = useExportConfigStore((s) => s.setPreviewClip);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // Empty set means "no filter -- all categories eligible"; clicking a chip
  // narrows to just the categories the user has explicitly checked.
  const [featuredCategories, setFeaturedCategories] = useState<Set<string>>(new Set());
  const [randomCount, setRandomCount] = useState(20);

  // Real, currently-selected-chapter duration estimate -- same inputs
  // PreviewPane uses for its own timeline (verse timing data + the
  // intro/outro window rules), so "how many clips will this need" reflects
  // the actual chapter/reciter picked, not a generic guess.
  const preview = usePreviewData(chapterId, reciterId, translationId);
  const verses = preview.data?.verses ?? [];
  // Not just the last array entry's endMs -- that specific verse could have
  // missing/estimated timing (endMs: null), so scan backward for the last
  // verse that actually has real timing data.
  const lastTimedVerse = [...verses].reverse().find((v) => v.endMs != null);
  const mainDurationMs = lastTimedVerse?.endMs ?? 0;
  const introWindowMs = computeIntroTimingWindow({
    introCardEnabled: intro.introCardEnabled,
    bismillahTextEnabled: intro.bismillahTextEnabled,
    bismillahAudioEnabled: intro.bismillahAudioEnabled,
    bismillahAudioDurationMs: preview.data?.bismillahAudioDurationMs,
    introCardDurationMs: intro.introCardDurationMs,
  }).windowMs;
  const outroWindowMs = outro.enabled ? outro.durationMs : 0;
  const estimatedTotalDurationSeconds = (introWindowMs + mainDurationMs + outroWindowMs) / 1000;
  const estimatedInstanceCount = instanceCountForDuration(
    estimatedTotalDurationSeconds,
    background.slotDurationSeconds,
    background.transitionDurationSeconds
  );

  function toggleFeaturedCategory(category: string) {
    setFeaturedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function handleRandomize() {
    if (!library.data) return;
    const picked = pickRandomAcrossCategories(library.data, featuredCategories, randomCount);
    setClipPool(picked);
  }

  // Checking a clip in also previews it immediately, so you can see what it
  // looks like before committing to it -- unchecking just removes it as
  // before, with no preview side effect.
  function handleToggle(clipId: string) {
    const wasSelected = background.clipIds.includes(clipId);
    toggleClipInPool(clipId);
    if (!wasSelected) setPreviewClip(clipId);
  }

  const clipTitleById = new Map([
    ...Object.values(library.data ?? {})
      .flat()
      .map((clip) => [clip.id, clip.title] as const),
    ...uploadedBackgroundClips.map((clip) => [clip.id, clip.title] as const),
  ]);

  return (
    <Panel title="Background">
      {library.loading && <p className="text-xs text-neutral-500">Loading clip library…</p>}
      {library.error && <p className="text-xs text-red-400">Failed to load background library: {library.error}</p>}

      {library.data && (
        <div className="space-y-2 rounded-md border border-neutral-800 p-2.5">
          <span className="text-xs font-medium text-neutral-300">🎲 Randomize selection</span>
          <p className="text-[11px] text-neutral-500">
            Pick which categories to feature (leave none checked to allow all), then randomize -- picks spread
            evenly across the featured categories and replace whatever's currently selected.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(library.data).map((category) => {
              const active = featuredCategories.has(category);
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => toggleFeaturedCategory(category)}
                  className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${
                    active
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                      : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <NumberField label="How many clips" value={randomCount} min={1} max={200} onChange={setRandomCount} />
            </div>
            {estimatedInstanceCount > 0 && (
              <button
                type="button"
                className="mb-[1px] rounded px-2 py-1.5 text-[11px] text-neutral-400 hover:bg-neutral-800"
                onClick={() => setRandomCount(estimatedInstanceCount)}
                title="Set the count to match how many clips this chapter will actually cycle through"
              >
                Match chapter (~{estimatedInstanceCount})
              </button>
            )}
          </div>
          <button
            type="button"
            className="w-full rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
            onClick={handleRandomize}
          >
            Randomize {randomCount} clip{randomCount === 1 ? '' : 's'}
            {featuredCategories.size > 0 ? ` from ${featuredCategories.size} categor${featuredCategories.size === 1 ? 'y' : 'ies'}` : ''}
          </button>
        </div>
      )}

      {background.clipIds.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-neutral-400">
            Rotation pool --{' '}
            <span className="text-emerald-400">
              {background.clipIds.length} selected
            </span>{' '}
            (drag to reorder{background.order === 'shuffle' ? ' -- shuffled at export, order here is ignored' : ''})
          </span>
          <ul className="space-y-1">
            {background.clipIds.map((clipId, i) => (
              <li
                key={`${clipId}-${i}`}
                draggable
                onDragStart={(e) => {
                  setDragIndex(i);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== i) setDragOverIndex(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== i) reorderClipInPool(dragIndex, i);
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                className={`flex items-center gap-1.5 rounded-md bg-neutral-800/70 px-2 py-1 text-xs cursor-grab active:cursor-grabbing ${
                  dragIndex === i ? 'opacity-40' : ''
                } ${dragOverIndex === i ? 'ring-1 ring-emerald-500' : ''}`}
              >
                <span className="text-neutral-500" aria-hidden="true">⠿</span>
                <span className="flex-1 truncate">{clipTitleById.get(clipId) ?? clipId}</span>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-neutral-400 hover:bg-neutral-700"
                  onClick={() => setPreviewClip(clipId)}
                  aria-label="Preview"
                  title="Show this clip in the preview"
                >
                  👁
                </button>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-neutral-400 hover:bg-neutral-700 disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => moveClipInPool(clipId, 'up')}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-neutral-400 hover:bg-neutral-700 disabled:opacity-30"
                  disabled={i === background.clipIds.length - 1}
                  onClick={() => moveClipInPool(clipId, 'down')}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-red-400 hover:bg-neutral-700"
                  onClick={() => toggleClipInPool(clipId)}
                  aria-label="Remove"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {background.clipIds.length === 0 && (
        <p className="text-xs text-neutral-500">
          No clips selected — export falls back to a static placeholder background.
        </p>
      )}

      {uploadedBackgroundClips.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-neutral-400">
            Uploaded{' '}
            <span
              className={
                uploadedBackgroundClips.filter((c) => background.clipIds.includes(c.id)).length > 0
                  ? 'text-emerald-400'
                  : 'text-neutral-600'
              }
            >
              ({uploadedBackgroundClips.filter((c) => background.clipIds.includes(c.id)).length}/
              {uploadedBackgroundClips.length})
            </span>
          </span>
          <ul className="space-y-1">
            {uploadedBackgroundClips.map((clip) => {
              const selected = background.clipIds.includes(clip.id);
              return (
                <li key={clip.id}>
                  <label className="flex items-center gap-2 text-sm text-neutral-200">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 accent-emerald-500"
                      checked={selected}
                      onChange={() => handleToggle(clip.id)}
                    />
                    {clip.title}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <BackgroundVideoUploadField />
      <BackgroundVideoGenerateField />

      {library.data &&
        Object.entries(library.data).map(([category, clips]) => {
          const categoryClipIds = clips.map((c) => c.id);
          const selectedInCategory = categoryClipIds.filter((id) => background.clipIds.includes(id)).length;
          const allSelected = categoryClipIds.every((id) => background.clipIds.includes(id));
          return (
            <div key={category} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-neutral-400 capitalize">
                  {category}{' '}
                  <span className={selectedInCategory > 0 ? 'text-emerald-400' : 'text-neutral-600'}>
                    ({selectedInCategory}/{categoryClipIds.length})
                  </span>
                </span>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-emerald-400 hover:bg-neutral-800"
                  onClick={() => toggleClipsInPool(categoryClipIds)}
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <ul className="space-y-1">
                {clips.map((clip) => {
                  const selected = background.clipIds.includes(clip.id);
                  return (
                    <li key={clip.id}>
                      <label className="flex items-center gap-2 text-sm text-neutral-200">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 accent-emerald-500"
                          checked={selected}
                          onChange={() => handleToggle(clip.id)}
                        />
                        {clip.title}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

      <div className="border-t border-neutral-800 pt-3 space-y-3">
        <SelectField label="Playback order" value={background.order} onChange={(v) => setBackgroundOrder(v as typeof background.order)}>
          <option value="sequential">Sequential</option>
          <option value="shuffle">Shuffle</option>
        </SelectField>

        <NumberField
          label="Clip display duration (s)"
          value={background.slotDurationSeconds}
          min={3}
          max={30}
          onChange={(v) => setBackgroundTiming({ slotDurationSeconds: v })}
        />
        <NumberField
          label="Crossfade transition (s)"
          value={background.transitionDurationSeconds}
          min={0.5}
          max={3}
          step={0.5}
          onChange={(v) => setBackgroundTiming({ transitionDurationSeconds: v })}
        />

        <SelectField
          label="Transition style"
          value={background.transitionStyle}
          onChange={(v) => setBackgroundTiming({ transitionStyle: v as typeof background.transitionStyle })}
        >
          {TRANSITION_STYLES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </SelectField>

        {background.clipIds.length > 0 && estimatedTotalDurationSeconds > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-neutral-500">
              This chapter (~{formatDuration(estimatedTotalDurationSeconds)}) will cycle through about{' '}
              <span className="font-medium text-neutral-300">{estimatedInstanceCount}</span> background clip
              {estimatedInstanceCount === 1 ? '' : 's'} total -- your {background.clipIds.length} selected clip
              {background.clipIds.length === 1 ? '' : 's'} will repeat about{' '}
              {(estimatedInstanceCount / background.clipIds.length).toFixed(1)}x each.
            </p>

            <div className="rounded-md bg-neutral-800/50 p-2">
              <span className="text-[11px] font-medium text-neutral-400">
                Clips needed by length, for this chapter
              </span>
              <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-neutral-300">
                {REFERENCE_CLIP_LENGTHS_SECONDS.map((lengthSeconds) => {
                  const count = instanceCountForDuration(
                    estimatedTotalDurationSeconds,
                    lengthSeconds,
                    background.transitionDurationSeconds
                  );
                  return (
                    <li key={lengthSeconds} className="flex justify-between">
                      <span>{lengthSeconds}s clips</span>
                      <span className="font-medium text-neutral-200">~{count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
