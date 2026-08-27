import { useExportConfigStore } from '../state/exportConfigStore';
import { CardBackgroundPicker } from './fields/CardBackgroundPicker';
import { CheckboxField } from './fields/CheckboxField';
import { NumberField } from './fields/NumberField';
import { TextField } from './fields/TextField';
import { Panel } from './Panel';

export function OutroPanel() {
  const outro = useExportConfigStore((s) => s.outro);
  const setOutro = useExportConfigStore((s) => s.setOutro);

  return (
    <Panel title="Outro">
      <CheckboxField label="Show outro card" checked={outro.enabled} onChange={(v) => setOutro({ enabled: v })} />

      {outro.enabled && (
        <>
          <NumberField
            label="Outro duration (ms)"
            value={outro.durationMs}
            min={1000}
            max={10000}
            step={250}
            onChange={(v) => setOutro({ durationMs: v })}
          />
          <TextField label="Line 1" value={outro.line1} onChange={(v) => setOutro({ line1: v })} />
          <TextField label="Line 2 (optional)" value={outro.line2} onChange={(v) => setOutro({ line2: v })} />
          <CardBackgroundPicker
            value={outro.cardBackgroundClipId}
            onChange={(clipId) => setOutro({ cardBackgroundClipId: clipId })}
          />
        </>
      )}

      <p className="text-xs text-neutral-500">
        A fixed block of extra time appended after the recitation ends, with a darkened full-frame card over
        your text -- the video's total length grows to make room for it.
      </p>
    </Panel>
  );
}
