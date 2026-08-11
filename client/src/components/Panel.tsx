import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  children: ReactNode;
  right?: ReactNode;
}

export function Panel({ title, children, right }: PanelProps) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
