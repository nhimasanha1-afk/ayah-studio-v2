import { useState } from 'react';
import { TRANSITION_STYLES } from '../lib/types';
import { useBackgroundLibrary } from '../lib/hooks';
import { useExportConfigStore } from '../state/exportConfigStore';
import { BackgroundVideoGenerateField } from './fields/BackgroundVideoGenerateField';
import { BackgroundVideoUploadField } from './fields/BackgroundVideoUploadField';
import { NumberField } from './fields/NumberField';
import { Panel } from './Panel';
import { SelectField } from './SelectField';

export function BackgroundPanel() {
  const library = useBackgroundLibrary();
  const background = useExportConfigStore((s) => s.background);
  const uploadedBackgroundClips = useExportConfigStore((s) => s.uploadedBackgroundClips);
  const setBackgroundOrder = useExportConfigStore((s) => s.setBackgroundOrder);
  const setBackgroundTiming = useExportConfigStore((s) => s.setBackgroundTiming);
  const toggleClipInPool = useExportConfigStore((s) => s.toggleClipInPool);
  const toggleClipsInPool = useExportConfigStore((s) => s.toggleClipsInPool);
  const moveClipInPool = useExportConfigStore((s) => s.moveClipInPool);
  const reorderClipInPool = useExportConfigStore((s) => s.reorderClipInPool);
  const setPreviewClip = useExportConfigStore((s) => s.setPreviewClip);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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

      {background.clipIds.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-neutral-400">
            Rotation pool (drag to reorder{background.order === 'shuffle' ? ' -- shuffled at export, order here is ignored' : ''})
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
          <span className="text-xs font-medium text-neutral-400">Uploaded</span>
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
          const allSelected = categoryClipIds.every((id) => background.clipIds.includes(id));
          return (
            <div key={category} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-neutral-400 capitalize">{category}</span>
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
          max={20}
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
      </div>
    </Panel>
  );
}
