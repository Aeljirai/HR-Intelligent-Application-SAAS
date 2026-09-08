import { CATEGORICAL } from '@/lib/chartColors';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  colorIndex?: number;
}

/** 12-point-style trend line for stat tiles — de-emphasized, no axes, no tooltip. */
export function Sparkline({ values, width = 96, height = 28, colorIndex = 0 }: SparklineProps) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const color = CATEGORICAL[colorIndex % CATEGORICAL.length];
  const [lastX, lastY] = points[points.length - 1]!;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={3} fill={color} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}
