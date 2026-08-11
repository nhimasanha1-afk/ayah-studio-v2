interface TextFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function TextField({ label, value, placeholder, onChange }: TextFieldProps) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-neutral-400">{label}</span>
      <input
        type="text"
        className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
