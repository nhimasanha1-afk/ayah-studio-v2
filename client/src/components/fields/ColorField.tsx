interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-neutral-400">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-8 w-10 shrink-0 cursor-pointer rounded border border-neutral-700 bg-neutral-900"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </label>
  );
}
