import type { ReactNode } from 'react';
import { Download } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './Feedback';
import { cn } from '@/lib/utils';
import { downloadCsv, toCsv } from '@/lib/csv';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  csvValue: (row: T) => string | number;
  align?: 'left' | 'right';
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  exportFilename: string;
  exportLabel: string;
  emptyTitle: string;
  emptyDescription?: string;
  maxHeightClassName?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  exportFilename,
  exportLabel,
  emptyTitle,
  emptyDescription,
  maxHeightClassName,
}: DataTableProps<T>) {
  function handleExport() {
    const csv = toCsv(
      rows,
      columns.map((c) => ({ label: c.header, value: c.csvValue }))
    );
    downloadCsv(exportFilename, csv);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <Button variant="secondary" size="sm" onClick={handleExport} disabled={!rows.length}>
          <Download size={13} />
          {exportLabel}
        </Button>
      </div>

      {!rows.length ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className={cn('overflow-auto rounded-lg border border-slate-100', maxHeightClassName)}>
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn('whitespace-nowrap border-b border-slate-100 px-3 py-2 font-medium', c.align === 'right' ? 'text-right' : 'text-left')}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={getRowKey(row)} className="hover:bg-slate-50">
                  {columns.map((c) => (
                    <td key={c.key} className={cn('whitespace-nowrap px-3 py-2 text-slate-600', c.align === 'right' ? 'text-right' : 'text-left')}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
