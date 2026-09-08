import type { PropsWithChildren, ReactNode } from 'react';

interface AppShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: AppShellProps) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl text-slate-800">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageContainer({ children }: PropsWithChildren) {
  return <main className="min-h-screen flex-1 overflow-y-auto bg-slate-50 px-8 py-8">{children}</main>;
}
