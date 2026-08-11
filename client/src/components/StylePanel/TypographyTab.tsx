import { FONT_REGISTRY } from '../../lib/types';
import { useExportConfigStore } from '../../state/exportConfigStore';
import { NumberField } from '../fields/NumberField';
import { SelectField } from '../SelectField';

export function TypographyTab() {
  const typography = useExportConfigStore((s) => s.style.typography);
  const setTypography = useExportConfigStore((s) => s.setTypography);

  return (
    <div className="space-y-3">
      <SelectField
        label="Arabic font"
        value={typography.arabicFont}
        onChange={(v) => setTypography({ arabicFont: v as typeof typography.arabicFont })}
      >
        {Object.entries(FONT_REGISTRY.arabic).map(([key, font]) => (
          <option key={key} value={key}>
            {font.label}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Latin font"
        value={typography.latinFont}
        onChange={(v) => setTypography({ latinFont: v as typeof typography.latinFont })}
      >
        {Object.entries(FONT_REGISTRY.latin).map(([key, font]) => (
          <option key={key} value={key}>
            {font.label}
          </option>
        ))}
      </SelectField>

      <NumberField
        label="Arabic font size"
        value={typography.arabicFontSize}
        min={30}
        max={100}
        onChange={(v) => setTypography({ arabicFontSize: v })}
      />

      <NumberField
        label="Translation font size"
        value={typography.translationFontSize}
        min={16}
        max={56}
        onChange={(v) => setTypography({ translationFontSize: v })}
      />
    </div>
  );
}
