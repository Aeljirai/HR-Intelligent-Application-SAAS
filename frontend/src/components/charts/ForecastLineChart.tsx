import { useMemo, useState } from 'react';
import { CATEGORICAL, CHROME } from '@/lib/chartColors';
import type { HeadcountPoint } from '@/types';

interface Props {
  data: HeadcountPoint[];
  width?: number;
  height?: number;
}

const PADDING = { top: 16, right: 16, bottom: 28, left: 40 };

/**
 * Headcount forecast: solid actuals -> solid forecast line, with a shaded
 * confidence band for the forward-looking months. One series (headcount),
 * so no legend box is needed — the actual/forecast split is a stroke-style
 * distinction plus the band, called out in a small caption instead.
 */
export function ForecastLineChart({ data, width = 640, height = 260 }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { linePath, bandPath, points, yTicks, xLabels, plotW, plotH } = useMemo(() => {
    const plotW = width - PADDING.left - PADDING.right;
    const plotH = height - PADDING.top - PADDING.bottom;

    const values = data.flatMap((d) => [d.actual, d.forecast, d.lower, d.upper]).filter((v): v is number => v != null);
    const min = Math.min(0, ...values);
    const max = Math.max(...values) * 1.1;
    const stepX = plotW / (data.length - 1);

    const xFor = (i: number) => PADDING.left + i * stepX;
    const yFor = (v: number) => PADDING.top + plotH - ((v - min) / (max - min || 1)) * plotH;

    const combined = data.map((d) => d.actual ?? d.forecast ?? 0);
    const linePath = combined
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`)
      .join(' ');

    const bandStartIndex = data.findIndex((d) => d.lower != null);
    let bandPath = '';
    if (bandStartIndex >= 0) {
      const upperPts = data
        .slice(bandStartIndex)
        .map((d, i) => `${i === 0 ? 'M' : 'L'}${xFor(bandStartIndex + i).toFixed(1)},${yFor(d.upper ?? 0).toFixed(1)}`)
        .join(' ');
      const lowerPts = data
        .slice(bandStartIndex)
        .reverse()
        .map((d) => `L${xFor(data.indexOf(d)).toFixed(1)},${yFor(d.lower ?? 0).toFixed(1)}`)
        .join(' ');
      bandPath = `${upperPts} ${lowerPts} Z`;
    }

    const points = data.map((d, i) => ({ x: xFor(i), y: yFor(d.actual ?? d.forecast ?? 0), d }));
    const yTicks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
    const xLabels = data.map((d, i) => ({ x: xFor(i), label: d.month.slice(2) }));

    return { linePath, bandPath, points, yTicks, xLabels, plotW, plotH };
  }, [data, width, height]);

  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * width - PADDING.left;
          const idx = Math.round((relX / plotW) * (data.length - 1));
          setHoverIndex(Math.min(Math.max(idx, 0), data.length - 1));
        }}
      >
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={PADDING.top + plotH - (i / 4) * plotH}
              y2={PADDING.top + plotH - (i / 4) * plotH}
              stroke={CHROME.gridline}
              strokeWidth={1}
            />
            <text x={4} y={PADDING.top + plotH - (i / 4) * plotH + 3} fontSize={10} fill={CHROME.mutedInk}>
              {Math.round(t)}
            </text>
          </g>
        ))}

        {bandPath && <path d={bandPath} fill={CATEGORICAL[0]} opacity={0.12} stroke="none" />}
        <path d={linePath} fill="none" stroke={CATEGORICAL[0]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoverIndex === i ? 5 : 3}
            fill={p.d.forecast != null && p.d.actual == null ? '#fff' : CATEGORICAL[0]}
            stroke={CATEGORICAL[0]}
            strokeWidth={2}
          />
        ))}

        {hovered && (
          <line x1={hovered.x} x2={hovered.x} y1={PADDING.top} y2={PADDING.top + plotH} stroke={CHROME.baseline} strokeWidth={1} strokeDasharray="3,3" />
        )}

        {xLabels
          .filter((_, i) => i % 2 === 0)
          .map((l, i) => (
            <text key={i} x={l.x} y={height - 8} fontSize={10} fill={CHROME.mutedInk} textAnchor="middle">
              {l.label}
            </text>
          ))}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: hovered.x, top: 0 }}
        >
          <div className="font-semibold text-slate-700">{hovered.d.month}</div>
          {hovered.d.actual != null && <div className="text-slate-500">Actual: {hovered.d.actual}</div>}
          {hovered.d.forecast != null && (
            <div className="text-slate-500">
              Forecast: {hovered.d.forecast} ({hovered.d.lower}–{hovered.d.upper})
            </div>
          )}
        </div>
      )}

      <div className="mt-1 flex items-center gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: CATEGORICAL[0] }} /> Actual headcount
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full border-2" style={{ borderColor: CATEGORICAL[0] }} /> Forecast
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm" style={{ background: CATEGORICAL[0], opacity: 0.2 }} /> Confidence band
        </span>
      </div>
    </div>
  );
}
