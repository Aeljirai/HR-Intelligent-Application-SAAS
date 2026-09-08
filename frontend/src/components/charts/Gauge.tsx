import { STATUS } from '@/lib/chartColors';

interface GaugeProps {
  value: number; // 0-100
  size?: number;
  label?: string;
}

function colorForScore(score: number) {
  if (score >= 70) return STATUS.critical;
  if (score >= 50) return STATUS.serious;
  if (score >= 30) return STATUS.warning;
  return STATUS.good;
}

/** Semicircular gauge for a 0-100 risk score — status color, never rank-colored. */
export function Gauge({ value, size = 200, label }: GaugeProps) {
  const radius = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = Math.PI;
  const endAngle = 0;
  const valueAngle = startAngle - (value / 100) * Math.PI;

  const arcPoint = (angle: number) => ({ x: cx + radius * Math.cos(angle), y: cy - radius * Math.sin(angle) });
  const trackStart = arcPoint(startAngle);
  const trackEnd = arcPoint(endAngle);
  const valuePoint = arcPoint(valueAngle);
  const largeArc = value > 50 ? 1 : 0;
  const color = colorForScore(value);
  const needle = arcPoint(valueAngle);

  return (
    <svg width={size} height={size / 2 + 40} viewBox={`0 0 ${size} ${size / 2 + 40}`}>
      <path
        d={`M ${trackStart.x} ${trackStart.y} A ${radius} ${radius} 0 1 1 ${trackEnd.x} ${trackEnd.y}`}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={14}
        strokeLinecap="round"
      />
      <path
        d={`M ${trackStart.x} ${trackStart.y} A ${radius} ${radius} 0 ${largeArc} 1 ${valuePoint.x} ${valuePoint.y}`}
        fill="none"
        stroke={color}
        strokeWidth={14}
        strokeLinecap="round"
      />
      <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke="#334155" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={5} fill="#334155" />
      <text x={cx} y={cy - 20} textAnchor="middle" fontSize={30} fontWeight={700} fill="#0f172a">
        {Math.round(value)}
      </text>
      {label && (
        <text x={cx} y={cy + 2} textAnchor="middle" fontSize={11} fill="#64748b">
          {label}
        </text>
      )}
    </svg>
  );
}
