import { LOGO_SHAPES, type LogoShape, type SurahBadgeVariant } from '../../lib/types';
import { useExportConfigStore } from '../../state/exportConfigStore';
import { CheckboxField } from '../fields/CheckboxField';
import { ColorField } from '../fields/ColorField';
import { LogoUploadField } from '../fields/LogoUploadField';
import { NumberField } from '../fields/NumberField';
import { PositionSelect } from '../fields/PositionSelect';
import { TextField } from '../fields/TextField';
import { SelectField } from '../SelectField';

function SubGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-neutral-800 pt-3 space-y-3">
      <h3 className="text-xs font-semibold text-neutral-300">{title}</h3>
      {children}
    </div>
  );
}

export function BadgesTab() {
  const badges = useExportConfigStore((s) => s.style.badges);
  const setBadge = useExportConfigStore((s) => s.setBadge);

  return (
    <div className="space-y-3">
      <SubGroup title="Watermark">
        <CheckboxField label="Enabled" checked={badges.watermark.enabled} onChange={(v) => setBadge('watermark', { enabled: v })} />
        {badges.watermark.enabled && (
          <>
            <TextField label="Text" value={badges.watermark.text} placeholder="@yourhandle" onChange={(v) => setBadge('watermark', { text: v })} />
            <ColorField label="Color" value={badges.watermark.color} onChange={(v) => setBadge('watermark', { color: v })} />
            <NumberField label="Opacity" value={badges.watermark.opacity} min={0} max={1} step={0.05} onChange={(v) => setBadge('watermark', { opacity: v })} />
            <NumberField label="Font size" value={badges.watermark.fontSize} min={12} max={48} onChange={(v) => setBadge('watermark', { fontSize: v })} />
            <PositionSelect value={badges.watermark.position} onChange={(v) => setBadge('watermark', { position: v })} />
          </>
        )}
      </SubGroup>

      <SubGroup title="Surah reference badge">
        <CheckboxField label="Enabled" checked={badges.surahBadge.enabled} onChange={(v) => setBadge('surahBadge', { enabled: v })} />
        {badges.surahBadge.enabled && (
          <>
            <SelectField
              label="Variant"
              value={badges.surahBadge.variant}
              onChange={(v) => setBadge('surahBadge', { variant: v as SurahBadgeVariant })}
            >
              <option value="inline">Inline</option>
              <option value="stacked-title-card">Stacked title card</option>
              <option value="arabic-transliteration">Arabic name + transliteration</option>
            </SelectField>
            <NumberField label="Font size" value={badges.surahBadge.fontSize} min={14} max={40} onChange={(v) => setBadge('surahBadge', { fontSize: v })} />
            <PositionSelect value={badges.surahBadge.position} onChange={(v) => setBadge('surahBadge', { position: v })} />
          </>
        )}
      </SubGroup>

      <SubGroup title="Channel logo">
        <CheckboxField label="Enabled" checked={badges.channelLogo.enabled} onChange={(v) => setBadge('channelLogo', { enabled: v })} />
        {badges.channelLogo.enabled && (
          <>
            <SelectField label="Shape" value={badges.channelLogo.shape} onChange={(v) => setBadge('channelLogo', { shape: v as LogoShape })}>
              {LOGO_SHAPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </SelectField>
            <NumberField label="Size" value={badges.channelLogo.size} min={40} max={200} onChange={(v) => setBadge('channelLogo', { size: v })} />
            <PositionSelect value={badges.channelLogo.position} onChange={(v) => setBadge('channelLogo', { position: v })} />
            <LogoUploadField />
          </>
        )}
      </SubGroup>

      <SubGroup title="Channel name badge">
        <CheckboxField
          label="Enabled"
          checked={badges.channelNameBadge.enabled}
          onChange={(v) => setBadge('channelNameBadge', { enabled: v })}
        />
        {badges.channelNameBadge.enabled && (
          <>
            <TextField label="Text" value={badges.channelNameBadge.text} placeholder="Your Channel" onChange={(v) => setBadge('channelNameBadge', { text: v })} />
            <NumberField label="Font size" value={badges.channelNameBadge.fontSize} min={12} max={40} onChange={(v) => setBadge('channelNameBadge', { fontSize: v })} />
            <PositionSelect value={badges.channelNameBadge.position} onChange={(v) => setBadge('channelNameBadge', { position: v })} />
          </>
        )}
      </SubGroup>
    </div>
  );
}
