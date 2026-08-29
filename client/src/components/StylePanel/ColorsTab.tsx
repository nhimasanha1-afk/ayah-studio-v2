import { TEXT_POSITIONS, TEXT_REVEAL_ANIMATIONS, VIDEO_FILTERS, ZOOM_PAN_STYLES } from '../../lib/types';
import { useExportConfigStore } from '../../state/exportConfigStore';
import { CheckboxField } from '../fields/CheckboxField';
import { ColorField } from '../fields/ColorField';
import { NumberField } from '../fields/NumberField';
import { SelectField } from '../SelectField';

export function ColorsTab() {
  const colors = useExportConfigStore((s) => s.style.colors);
  const setColors = useExportConfigStore((s) => s.setColors);
  const setScrim = useExportConfigStore((s) => s.setScrim);

  return (
    <div className="space-y-3">
      <ColorField label="Arabic text color" value={colors.arabicTextColor} onChange={(v) => setColors({ arabicTextColor: v })} />
      <ColorField
        label="Translation text color"
        value={colors.translationTextColor}
        onChange={(v) => setColors({ translationTextColor: v })}
      />
      <CheckboxField
        label="Highlight active word"
        checked={colors.wordHighlightEnabled}
        onChange={(v) => setColors({ wordHighlightEnabled: v })}
      />
      {colors.wordHighlightEnabled && (
        <ColorField
          label="Word highlight color"
          value={colors.highlightColor}
          onChange={(v) => setColors({ highlightColor: v })}
        />
      )}
      <ColorField label="Outline color" value={colors.outlineColor} onChange={(v) => setColors({ outlineColor: v })} />

      <NumberField label="Outline width" value={colors.outlineWidth} min={0} max={6} onChange={(v) => setColors({ outlineWidth: v })} />
      <NumberField label="Shadow depth" value={colors.shadowDepth} min={0} max={4} onChange={(v) => setColors({ shadowDepth: v })} />

      <SelectField
        label="Text position"
        value={colors.textPosition}
        onChange={(v) => setColors({ textPosition: v as typeof colors.textPosition })}
      >
        {TEXT_POSITIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Text reveal animation"
        value={colors.textRevealAnimation}
        onChange={(v) => setColors({ textRevealAnimation: v as typeof colors.textRevealAnimation })}
      >
        {TEXT_REVEAL_ANIMATIONS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </SelectField>

      <CheckboxField
        label="Show ayah numbers (Arabic)"
        checked={colors.showArabicAyahNumbers}
        onChange={(v) => setColors({ showArabicAyahNumbers: v })}
      />
      <CheckboxField
        label="Show ayah numbers (translation)"
        checked={colors.showAyahNumbers}
        onChange={(v) => setColors({ showAyahNumbers: v })}
      />

      <div className="border-t border-neutral-800 pt-3 space-y-3">
        <CheckboxField label="Scrim (darkened caption background)" checked={colors.scrim.enabled} onChange={(v) => setScrim({ enabled: v })} />
        {colors.scrim.enabled && (
          <>
            <ColorField label="Scrim color" value={colors.scrim.color} onChange={(v) => setScrim({ color: v })} />
            <NumberField
              label="Scrim opacity"
              value={colors.scrim.opacity}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => setScrim({ opacity: v })}
            />
          </>
        )}
      </div>

      <div className="border-t border-neutral-800 pt-3 space-y-3">
        <span className="text-xs font-medium text-neutral-400">Background look</span>

        <SelectField
          label="Video filter"
          value={colors.videoFilter}
          onChange={(v) => setColors({ videoFilter: v as typeof colors.videoFilter })}
        >
          {VIDEO_FILTERS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </SelectField>

        <NumberField
          label="Background blur"
          value={colors.backgroundBlur}
          min={0}
          max={20}
          onChange={(v) => setColors({ backgroundBlur: v })}
        />

        <SelectField
          label="Ken Burns zoom/pan"
          value={colors.backgroundZoomPan}
          onChange={(v) => setColors({ backgroundZoomPan: v as typeof colors.backgroundZoomPan })}
        >
          {ZOOM_PAN_STYLES.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </SelectField>
      </div>
    </div>
  );
}
