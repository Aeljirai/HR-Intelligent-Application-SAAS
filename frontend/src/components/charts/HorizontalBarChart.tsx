import { CATEGORICAL, CHROME } from '@/lib/chartColors';

interface BarDatum {
  label: string;
  value: number;
}

interface Props {
  data: BarDatum[];
  width?: number;
  barHeight?: number;
  valueFormatter?: (v: number) => string;
  colorIndex?: number;
}

/** Horizontal ranking bars — value labeled at the tip, single series (no legend needed). */
export function HorizontalBarChart({ data, width = 480, barHeight = 22, valueFormatter, colorIndex = 0 }: Props) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const labelWidth = 140;
  const plotW = width - labelWidth - 56;
  const gap = 8;
  const height = data.length * (barHeight + gap);
  const color = CATEGORICAL[colorIndex % CATEGORICAL.length];
  const format = valueFormatter ?? ((v: number) => v.toLocaleString());

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {data.map((d, i) => {
        const barW = Math.max(2, (d.value / max) * plotW);
        const y = i * (barHeight + gap);
        return (
          <g key={d.label}>
            <text x={labelWidth - 8} y={y + barHeight / 2 + 4} textAnchor="end" fontSize={11} fill={CHROME.secondaryInk}>
              {d.label.length > 18 ? `${d.label.slice(0, 17)}…` : d.label}
            </text>
            <rect x={labelWidth} y={y} width={plotW} height={barHeight} rx={4} fill={CHROME.gridline} opacity={0.4} />
            <rect x={labelWidth} y={y} width={barW} height={barHeight} rx={4} fill={color} />
            <text x={labelWidth + barW + 8} y={y + barHeight / 2 + 4} fontSize={11} fill={CHROME.primaryInk} fontWeight={600}>
              {format(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
