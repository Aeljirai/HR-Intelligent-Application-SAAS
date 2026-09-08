import type { ReactNode } from 'react';
import { Card } from './Card';
import { cn } from '@/lib/utils';

interface StatTileProps {
  label: string;
  value: string;
  delta?: { value: string; positive: boolean };
  icon?: ReactNode;
}

export function StatTile({ label, value, delta, icon }: StatTileProps) {
  return (
    <Card className="px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        {icon && <span className="text-slate-300">{icon}</span>}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-2xl font-semibold text-slate-800">{value}</span>
        {delta && (
          <span className={cn('mb-0.5 text-xs font-medium', delta.positive ? 'text-emerald-600' : 'text-red-600')}>
            {delta.value}
          </span>
        )}
      </div>
    </Card>
  );
}
