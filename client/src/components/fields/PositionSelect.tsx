import { POSITIONS, type BadgePosition } from '../../lib/types';
import { SelectField } from '../SelectField';

export function PositionSelect({ value, onChange }: { value: BadgePosition; onChange: (v: BadgePosition) => void }) {
  return (
    <SelectField label="Position" value={value} onChange={(v) => onChange(v as BadgePosition)}>
      {POSITIONS.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </SelectField>
  );
}
