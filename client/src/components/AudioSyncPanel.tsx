import { useExportConfigStore } from '../state/exportConfigStore';
import { NumberField } from './fields/NumberField';
import { Panel } from './Panel';

export function AudioSyncPanel() {
  const offsetMs = useExportConfigStore((s) => s.audioSync.offsetMs);
  const volumeMultiplier = useExportConfigStore((s) => s.audioSync.volumeMultiplier);
  const setAudioSync = useExportConfigStore((s) => s.setAudioSync);
  const displayDelayMs = useExportConfigStore((s) => s.captionTiming.displayDelayMs);
  const setCaptionTiming = useExportConfigStore((s) => s.setCaptionTiming);

  return (
    <Panel title="Audio Sync & Caption Timing">
      <NumberField
        label="Recitation offset (ms)"
        value={offsetMs}
        min={-2000}
        max={2000}
        step={50}
        onChange={(offsetMs) => setAudioSync({ offsetMs })}
      />
      <p className="text-xs text-neutral-500">
        Shifts only the audible recitation earlier/later. Captions are timed independently and won't move --
        use this if the audio itself sounds out of sync with the video.
      </p>

      <NumberField
        label="Recitation volume"
        value={volumeMultiplier}
        min={0}
        max={2}
        step={0.05}
        onChange={(volumeMultiplier) => setAudioSync({ volumeMultiplier })}
      />

      <div className="border-t border-neutral-800 pt-3 space-y-1">
        <NumberField
          label="Verse display delay (ms)"
          value={displayDelayMs}
          min={-2000}
          max={5000}
          step={50}
          onChange={(displayDelayMs) => setCaptionTiming({ displayDelayMs })}
        />
        <p className="text-xs text-neutral-500">
          The mirror of the offset above -- shifts only when captions appear, leaving the audio untouched.
        </p>
      </div>
    </Panel>
  );
}
