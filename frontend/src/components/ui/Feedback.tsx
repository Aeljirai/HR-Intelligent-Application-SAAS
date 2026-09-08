import { Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n';

export function Spinner({ label }: { label?: string }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
      <Loader2 className="animate-spin" size={16} />
      {label ?? t('common.loading')}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {description && <p className="max-w-sm text-xs text-slate-400">{description}</p>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>
  );
}
