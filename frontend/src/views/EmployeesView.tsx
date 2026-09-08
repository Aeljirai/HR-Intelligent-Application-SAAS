import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { PageContainer, PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/Feedback';
import { useDepartments, useEmployees } from '@/hooks/queries';
import { formatCurrency, initials } from '@/lib/utils';
import type { Employee } from '@/types';

const RISK_TONE: Record<string, BadgeTone> = { low: 'green', moderate: 'amber', high: 'amber', severe: 'red' };
const SENIORITY_RANK: Record<Employee['seniority'], number> = { junior: 0, mid: 1, senior: 2, lead: 3, principal: 4 };

export function EmployeesView() {
  const t = useT();
  const employeesQuery = useEmployees();
  const departmentsQuery = useDepartments();
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Employee | null>(null);

  const departments = departmentsQuery.data ?? [];
  const employees = employeesQuery.data ?? [];

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      const matchesSearch = e.full_name.toLowerCase().includes(search.toLowerCase()) || e.job_title.toLowerCase().includes(search.toLowerCase());
      const matchesDept = departmentFilter === 'all' || e.department_id === departmentFilter;
      return matchesSearch && matchesDept;
    });
  }, [employees, search, departmentFilter]);

  return (
    <PageContainer>
      <PageHeader
        title={t('employees.title')}
        subtitle={t('employees.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">{t('common.allDepartments')}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('employees.searchPlaceholder')}
                className="rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm"
              />
            </div>
          </div>
        }
      />

      {employeesQuery.isLoading ? (
        <Spinner />
      ) : employeesQuery.isError ? (
        <ErrorState message={t('employees.couldNotLoad')} />
      ) : !filtered.length ? (
        <EmptyState title={t('employees.noMatches')} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => (
            <Card key={e.id} className="cursor-pointer hover:border-blue-300" onClick={() => setSelected(e)}>
              <CardBody>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                    {initials(e.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800">{e.full_name}</div>
                    <div className="truncate text-xs text-slate-400">{e.job_title}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-slate-500">{t('employees.flightRisk')}</span>
                  {e.flight_risk && (
                    <Badge tone={RISK_TONE[e.flight_risk.band]}>
                      {e.flight_risk.score.toFixed(0)} · {t(`status.${e.flight_risk.band}`)}
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-slate-500">{t('employees.turnoverModel')}</span>
                  {e.turnover_model && (
                    <Badge tone={RISK_TONE[e.turnover_model.band]}>
                      {(e.turnover_model.probability * 100).toFixed(0)}% · {t(`status.${e.turnover_model.band}`)}
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(e.skills ?? []).slice(0, 3).map((s) => (
                    <Badge key={s.id} tone="slate">{s.skill_name}</Badge>
                  ))}
                  {(e.skills?.length ?? 0) > 3 && <Badge tone="slate">+{(e.skills?.length ?? 0) - 3}</Badge>}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {selected && (
        <EmployeeDetailModal
          employee={selected}
          allEmployees={employees}
          onClose={() => setSelected(null)}
        />
      )}
    </PageContainer>
  );
}

function EmployeeDetailModal({ employee, allEmployees, onClose }: { employee: Employee; allEmployees: Employee[]; onClose: () => void }) {
  const t = useT();
  const pathway = useMemo(() => computeCareerPathway(employee, allEmployees), [employee, allEmployees]);

  return (
    <Modal open onClose={onClose} title={employee.full_name} widthClassName="max-w-2xl">
      <div className="space-y-5">
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>{employee.job_title}</span>
          <span>{formatCurrency(employee.salary)} / yr</span>
        </div>

        {employee.flight_risk && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-700">{t('employees.factorsTitle')}</h4>
            <div className="space-y-1.5">
              {employee.flight_risk.factors.map((f) => (
                <div key={f.factor} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{f.label}</span>
                  <span className="font-medium text-slate-700">
                    {f.detail} · impact {f.impact.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">{t('employees.pathwayTitle')}</h4>
          {pathway.targetRole ? (
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="text-xs text-slate-500">
                {t('employees.nearestRole')} <span className="font-medium text-slate-700">{pathway.targetRole.job_title}</span> ({pathway.targetRole.full_name})
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pathway.matchedSkills.map((s) => <Badge key={s} tone="green">{s}</Badge>)}
              </div>
              {pathway.gapSkills.length > 0 && (
                <>
                  <p className="mb-1 mt-3 text-xs text-slate-500">{t('employees.skillsToDevelop')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {pathway.gapSkills.map((s) => <Badge key={s} tone="amber">{s}</Badge>)}
                  </div>
                </>
              )}
            </div>
          ) : (
            <EmptyState title={t('employees.noPathway')} description={t('employees.noPathwayDesc')} />
          )}
        </div>
      </div>
    </Modal>
  );
}

function computeCareerPathway(employee: Employee, all: Employee[]) {
  const candidates = all.filter(
    (e) =>
      e.id !== employee.id &&
      e.department_id === employee.department_id &&
      SENIORITY_RANK[e.seniority] > SENIORITY_RANK[employee.seniority]
  );
  const targetRole = candidates.sort((a, b) => SENIORITY_RANK[a.seniority] - SENIORITY_RANK[b.seniority])[0] ?? null;

  const mySkills = new Set((employee.skills ?? []).map((s) => s.skill_name));
  const targetSkills = new Set((targetRole?.skills ?? []).map((s) => s.skill_name));

  const matchedSkills = [...targetSkills].filter((s) => mySkills.has(s));
  const gapSkills = [...targetSkills].filter((s) => !mySkills.has(s));

  return { targetRole, matchedSkills, gapSkills };
}
