import type { ReactNode } from 'react';

interface SelectFieldProps {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}

export function SelectField({ label, value, onChange, disabled, children }: SelectFieldProps) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-neutral-400">{label}</span>
      <select
        className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 disabled:opacity-50"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
