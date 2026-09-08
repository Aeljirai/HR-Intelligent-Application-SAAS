import type { HTMLAttributes, PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, children, ...rest }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...rest }: PropsWithChildren<HTMLAttributes<HTMLHeadingElement>>) {
  return (
    <h3 className={cn('text-sm font-semibold text-slate-800', className)} {...rest}>
      {children}
    </h3>
  );
}

export function CardBody({ className, children, ...rest }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={cn('px-5 py-4', className)} {...rest}>
      {children}
    </div>
  );
}
