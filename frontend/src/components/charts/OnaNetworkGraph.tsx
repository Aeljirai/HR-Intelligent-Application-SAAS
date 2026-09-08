import { useMemo, useState } from 'react';
import { CATEGORICAL, SENTIMENT_PULSE, STATUS } from '@/lib/chartColors';
import type { Department, OnaGraph } from '@/types';

interface Props {
  graph: OnaGraph;
  departments: Department[];
  colorBy?: 'department' | 'pulse';
  pulseById?: Map<string, number>;
  width?: number;
  height?: number;
}

/** Buckets a -1..1 pulse score into a discrete red/gray/green tone — matches
 *  this app's preference for banded status over continuous gradients
 *  (flight-risk bands, ticket urgency, sentiment label are all banded too). */
function pulseColor(score: number): string {
  if (score > 0.15) return SENTIMENT_PULSE.positive;
  if (score < -0.15) return SENTIMENT_PULSE.negative;
  return SENTIMENT_PULSE.neutral;
}

/**
 * Deterministic cluster layout (department clusters arranged on a ring, each
 * employee placed on a small circle around their department's center) rather
 * than a physics simulation — it's stable across renders, has no settle-time
 * jitter, and still reads the collaboration structure clearly: bridges visibly
 * cross between clusters, isolated nodes sit alone at a cluster's edge.
 */
export function OnaNetworkGraph({ graph, departments, colorBy = 'department', pulseById, width = 640, height = 480 }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const layout = useMemo(() => {
    const cx = width / 2;
    const cy = height / 2;
    const clusterRadius = Math.min(width, height) / 2 - 90;

    const deptIds = departments.map((d) => d.id);
    const positions = new Map<string, { x: number; y: number; deptIndex: number }>();

    deptIds.forEach((deptId, deptIndex) => {
      const angle = (deptIndex / deptIds.length) * 2 * Math.PI - Math.PI / 2;
      const clusterCx = cx + clusterRadius * Math.cos(angle);
      const clusterCy = cy + clusterRadius * Math.sin(angle);

      const members = graph.nodes.filter((n) => n.department_id === deptId);
      const memberRadius = Math.min(70, 14 + members.length * 6);
      members.forEach((member, i) => {
        const memberAngle = (i / Math.max(1, members.length)) * 2 * Math.PI;
        positions.set(member.id, {
          x: clusterCx + memberRadius * Math.cos(memberAngle),
          y: clusterCy + memberRadius * Math.sin(memberAngle),
          deptIndex,
        });
      });
    });

    // Unassigned-department nodes go in the very center.
    graph.nodes
      .filter((n) => !n.department_id || !positions.has(n.id))
      .forEach((n, i) => {
        if (positions.has(n.id)) return;
        const angle = (i / 6) * 2 * Math.PI;
        positions.set(n.id, { x: cx + 24 * Math.cos(angle), y: cy + 24 * Math.sin(angle), deptIndex: -1 });
      });

    return positions;
  }, [graph, departments, width, height]);

  const deptColor = new Map(departments.map((d, i) => [d.id, CATEGORICAL[i % CATEGORICAL.length]]));

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <style>{`
          @keyframes ona-pulse { 0% { r: 12; opacity: 0.5; } 100% { r: 22; opacity: 0; } }
          .ona-bridge-ring { animation: ona-pulse 1.8s ease-out infinite; }
        `}</style>
      </defs>

      {graph.edges.map((edge, i) => {
        const a = layout.get(edge.source);
        const b = layout.get(edge.target);
        if (!a || !b) return null;
        const isHighlighted = hoveredId === edge.source || hoveredId === edge.target;
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={isHighlighted ? '#334155' : '#cbd5e1'}
            strokeWidth={Math.min(4, 1 + edge.weight * 0.6)}
            opacity={isHighlighted ? 0.9 : 0.5}
          />
        );
      })}

      {graph.nodes.map((node) => {
        const pos = layout.get(node.id);
        if (!pos) return null;
        const color =
          colorBy === 'pulse'
            ? pulseColor(pulseById?.get(node.id) ?? 0)
            : node.department_id
              ? (deptColor.get(node.department_id) ?? '#64748b')
              : '#94a3b8';
        const radius = node.role === 'core' ? 9 : node.role === 'isolated' ? 5 : 7;

        return (
          <g
            key={node.id}
            transform={`translate(${pos.x}, ${pos.y})`}
            onMouseEnter={() => setHoveredId(node.id)}
            onMouseLeave={() => setHoveredId((id) => (id === node.id ? null : id))}
            style={{ cursor: 'pointer' }}
          >
            {node.role === 'bridge' && (
              <circle r={12} fill="none" stroke={STATUS.warning} strokeWidth={2} className="ona-bridge-ring" />
            )}
            <circle
              r={radius}
              fill={node.role === 'isolated' ? '#fff' : color}
              stroke={node.role === 'isolated' ? '#94a3b8' : '#fff'}
              strokeWidth={node.role === 'isolated' ? 1.5 : 2}
              strokeDasharray={node.role === 'isolated' ? '2,2' : undefined}
            />
            {hoveredId === node.id && (
              <g transform="translate(12, -10)">
                <rect x={0} y={-14} width={Math.max(90, node.full_name.length * 6.5)} height={colorBy === 'pulse' ? 56 : 40} rx={6} fill="#0f172a" />
                <text x={8} y={0} fontSize={11} fill="#fff" fontWeight={600}>
                  {node.full_name}
                </text>
                <text x={8} y={16} fontSize={10} fill="#cbd5e1">
                  {node.role} · {node.degree} link{node.degree === 1 ? '' : 's'}
                </text>
                {colorBy === 'pulse' && (
                  <text x={8} y={32} fontSize={10} fill="#cbd5e1">
                    pulse {(pulseById?.get(node.id) ?? 0).toFixed(2)}
                  </text>
                )}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
