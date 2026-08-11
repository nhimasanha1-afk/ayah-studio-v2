interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

export function NumberField({ label, value, min, max, step = 1, onChange }: NumberFieldProps) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between text-xs font-medium text-neutral-400">
        <span>{label}</span>
        <span className="text-neutral-300 tabular-nums">{value}</span>
      </span>
      <input
        type="range"
        className="w-full accent-emerald-500"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
