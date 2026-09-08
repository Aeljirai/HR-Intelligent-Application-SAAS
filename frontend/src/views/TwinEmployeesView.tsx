import { useMemo, useState } from 'react';
import { Search, Users2, Layers, Shuffle } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { PageContainer, PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatTile } from '@/components/ui/StatTile';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/Feedback';
import { useTwinEmployees } from '@/hooks/queries';
import { categoricalColor } from '@/lib/chartColors';
import { initials } from '@/lib/utils';
import type { TwinGroup, TwinMember } from '@/types';

export function TwinEmployeesView() {
  const t = useT();
  const twinQuery = useTwinEmployees();
  const [query, setQuery] = useState('');

  const groups = twinQuery.data?.groups ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) => g.skill.toLowerCase().includes(q) || g.members.some((m) => m.full_name.toLowerCase().includes(q))
    );
  }, [groups, query]);

  const employeesInvolved = useMemo(() => {
    const ids = new Set<string>();
    groups.forEach((g) => g.members.forEach((m) => ids.add(m.employee_id)));
    return ids.size;
  }, [groups]);

  const totalCrossPairs = useMemo(() => groups.reduce((sum, g) => sum + g.cross_project_pairs, 0), [groups]);

  return (
    <PageContainer>
      <PageHeader title={t('twinEmployees.title')} subtitle={t('twinEmployees.subtitle')} />

      {twinQuery.isLoading ? (
        <Spinner />
      ) : twinQuery.isError ? (
        <ErrorState message={t('twinEmployees.couldNotLoad')} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile label={t('twinEmployees.statGroups')} value={String(groups.length)} icon={<Layers size={18} />} />
            <StatTile label={t('twinEmployees.statEmployees')} value={String(employeesInvolved)} icon={<Users2 size={18} />} />
            <StatTile label={t('twinEmployees.statCrossPairs')} value={String(totalCrossPairs)} icon={<Shuffle size={18} />} />
          </div>

          <div className="mt-4 relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('twinEmployees.searchPlaceholder')}
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="mt-4">
            {!filtered.length ? (
              <EmptyState title={t('twinEmployees.noGroups')} description={t('twinEmployees.noGroupsDesc')} />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {filtered.map((g) => (
                  <TwinGroupCard key={g.skill} group={g} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </PageContainer>
  );
}

function projectColor(projectId: string, order: string[]): string {
  return categoricalColor(order.indexOf(projectId));
}

function TwinGroupCard({ group }: { group: TwinGroup }) {
  const t = useT();
  const projectOrder = useMemo(() => {
    const seen: string[] = [];
    group.members.forEach((m) => m.projects.forEach((p) => { if (!seen.includes(p.id)) seen.push(p.id); }));
    return seen;
  }, [group]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            <Users2 size={16} />
          </div>
          <CardTitle className="text-base capitalize">{group.skill}</CardTitle>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone="violet">{t('twinEmployees.memberCount', { count: group.members.length })}</Badge>
          <Badge tone="blue">{t('twinEmployees.projectCount', { count: group.distinct_project_count })}</Badge>
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        {group.members.map((m) => (
          <TwinMemberRow key={m.employee_id} member={m} projectOrder={projectOrder} />
        ))}
      </CardBody>
    </Card>
  );
}

function TwinMemberRow({ member, projectOrder }: { member: TwinMember; projectOrder: string[] }) {
  const t = useT();
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
        {initials(member.full_name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-slate-800">{member.full_name}</span>
          <span className="shrink-0 text-[11px] text-slate-400">{t('twinEmployees.proficiency', { level: member.proficiency })}</span>
        </div>
        <div className="truncate text-xs text-slate-400">
          {member.job_title} · <span className="capitalize">{member.seniority}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {member.projects.length === 0 ? (
            <span className="rounded-full bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-400">
              {t('twinEmployees.unassignedProject')}
            </span>
          ) : (
            member.projects.map((p) => {
              const color = projectColor(p.id, projectOrder);
              return (
                <span
                  key={p.id}
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: `${color}1a`, color }}
                >
                  {p.name}
                </span>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
