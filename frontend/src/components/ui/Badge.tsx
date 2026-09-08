import type { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'slate' | 'blue' | 'green' | 'amber' | 'red' | 'rose' | 'violet';

const TONE_CLASSES: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 text-slate-700',
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  rose: 'bg-rose-50 text-rose-700',
  violet: 'bg-violet-50 text-violet-700',
};

export function Badge({ tone = 'slate', children, className }: PropsWithChildren<{ tone?: BadgeTone; className?: string }>) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', TONE_CLASSES[tone], className)}>
      {children}
    </span>
  );
}
