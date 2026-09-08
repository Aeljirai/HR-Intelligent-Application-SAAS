import { useState } from 'react';
import { STATUS } from '@/lib/chartColors';
import type { GeoSummary } from '@/types';

interface Props {
  points: GeoSummary[];
  width?: number;
  height?: number;
}

// Simple equirectangular projection clipped to the continental US bounding box.
const BOUNDS = { minLat: 24, maxLat: 49, minLng: -125, maxLng: -66 };

function project(lat: number, lng: number, width: number, height: number) {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * width;
  const y = height - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * height;
  return { x, y };
}

/**
 * Lightweight workforce map: no external map-tile/geo library (keeps the
 * bundle dependency-free) — just a bounding-box projection over a schematic
 * US backdrop, which is enough to communicate regional distribution without
 * pretending to be a GIS tool.
 */
export function GeoMap({ points, width = 640, height = 360 }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const maxHeadcount = Math.max(...points.map((p) => p.headcount), 1);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x={0} y={0} width={width} height={height} rx={12} fill="#f1f5f9" />
      {Array.from({ length: 5 }, (_, i) => (
        <line key={`v${i}`} x1={(width / 5) * i} x2={(width / 5) * i} y1={0} y2={height} stroke="#e2e8f0" strokeWidth={1} />
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <line key={`h${i}`} x1={0} x2={width} y1={(height / 4) * i} y2={(height / 4) * i} stroke="#e2e8f0" strokeWidth={1} />
      ))}
      <text x={12} y={20} fontSize={11} fill="#94a3b8">
        Continental US — approximate regional distribution
      </text>

      {points.map((p) => {
        const { x, y } = project(p.lat, p.lng, width, height);
        const radius = 10 + (p.headcount / maxHeadcount) * 24;
        const activeRatio = p.headcount > 0 ? p.active / p.headcount : 1;
        const color = activeRatio > 0.9 ? STATUS.good : activeRatio > 0.75 ? STATUS.warning : STATUS.serious;
        const isHovered = hovered === p.region;

        return (
          <g key={p.region} onMouseEnter={() => setHovered(p.region)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }}>
            <circle cx={x} cy={y} r={radius + 6} fill={color} opacity={0.15}>
              <animate attributeName="r" values={`${radius};${radius + 10};${radius}`} dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.2;0;0.2" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <circle cx={x} cy={y} r={radius} fill={color} opacity={0.85} stroke="#fff" strokeWidth={2} />
            <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
              {p.headcount}
            </text>
            {isHovered && (
              <g transform={`translate(${x + radius + 8}, ${y - 16})`}>
                <rect x={0} y={-14} width={Math.max(120, p.region.length * 6.5)} height={44} rx={6} fill="#0f172a" />
                <text x={8} y={0} fontSize={11} fontWeight={600} fill="#fff">
                  {p.region}
                </text>
                <text x={8} y={16} fontSize={10} fill="#cbd5e1">
                  {p.active}/{p.headcount} active
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
