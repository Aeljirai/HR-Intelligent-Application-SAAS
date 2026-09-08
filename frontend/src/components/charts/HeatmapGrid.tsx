import { SEQUENTIAL_BLUE } from '@/lib/chartColors';

interface HeatmapCell {
  row: string;
  value: number; // 0-100
  sublabel?: string;
}

interface Props {
  cells: HeatmapCell[];
  title: string;
  formatValue?: (v: number) => string;
}

function stepForValue(v: number) {
  const idx = Math.min(SEQUENTIAL_BLUE.length - 1, Math.floor((v / 100) * SEQUENTIAL_BLUE.length));
  return SEQUENTIAL_BLUE[idx]!;
}

/** Single-column sequential heatmap (one hue, light->dark = magnitude). */
export function HeatmapGrid({ cells, title, formatValue }: Props) {
  const format = formatValue ?? ((v: number) => `${Math.round(v)}%`);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
        <span>{title}</span>
        <span className="flex items-center gap-1">
          Low
          <span className="inline-flex overflow-hidden rounded">
            {SEQUENTIAL_BLUE.map((c) => (
              <span key={c} style={{ background: c }} className="h-2 w-3" />
            ))}
          </span>
          High
        </span>
      </div>
      <div className="space-y-1.5">
        {cells.map((cell) => {
          const bg = stepForValue(cell.value);
          const isDark = SEQUENTIAL_BLUE.indexOf(bg) >= 4;
          return (
            <div key={cell.row} className="flex items-center gap-3">
              <div className="w-36 truncate text-xs text-slate-600">{cell.row}</div>
              <div
                className="flex h-8 flex-1 items-center justify-between rounded-md px-3 text-xs font-semibold"
                style={{ background: bg, color: isDark ? '#fff' : '#0b0b0b' }}
              >
                <span>{format(cell.value)}</span>
                {cell.sublabel && <span className="font-normal opacity-80">{cell.sublabel}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
