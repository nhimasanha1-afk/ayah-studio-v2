import { ASPECT_RATIOS, RESOLUTIONS } from '../lib/types';
import { useExportConfigStore } from '../state/exportConfigStore';
import { Panel } from './Panel';
import { SelectField } from './SelectField';

export function VideoFormatPanel() {
  const resolution = useExportConfigStore((s) => s.resolution);
  const aspectRatio = useExportConfigStore((s) => s.aspectRatio);
  const setResolution = useExportConfigStore((s) => s.setResolution);
  const setAspectRatio = useExportConfigStore((s) => s.setAspectRatio);

  return (
    <Panel title="Video Format">
      <SelectField label="Resolution" value={resolution} onChange={(v) => setResolution(v as typeof resolution)}>
        {RESOLUTIONS.map((r) => (
          <option key={r} value={r}>
            {r === '4k' ? '4K' : r}
          </option>
        ))}
      </SelectField>

      {resolution === '4k' && (
        <p className="text-xs text-amber-400">
          4K needs significantly more server memory than 720p/1080p. If the current server plan is too small, the
          export will be rejected upfront with a clear message rather than risking a crash.
        </p>
      )}

      <SelectField label="Aspect ratio" value={aspectRatio} onChange={(v) => setAspectRatio(v as typeof aspectRatio)}>
        {ASPECT_RATIOS.map((a) => (
          <option key={a} value={a}>
            {a} {a === '9:16' ? '(vertical)' : '(widescreen)'}
          </option>
        ))}
      </SelectField>
    </Panel>
  );
}
