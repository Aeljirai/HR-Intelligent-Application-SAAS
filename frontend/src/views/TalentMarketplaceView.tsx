import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useT, useDict } from '@/lib/i18n';
import { PageContainer, PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/Feedback';
import { useDepartments, useEmployees } from '@/hooks/queries';
import { searchTalent, type TalentMatch } from '@/lib/ml/talentMatch';
import { STATUS } from '@/lib/chartColors';
import { formatCurrency, initials } from '@/lib/utils';

export function TalentMarketplaceView() {
  const t = useT();
  const dict = useDict();
  const employeesQuery = useEmployees();
  const departmentsQuery = useDepartments();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');

  const employees = employeesQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];
  const deptNameById = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const results = useMemo(() => (submitted.trim() ? searchTalent(submitted, employees) : []), [submitted, employees]);

  function run(text: string) {
    setQuery(text);
    setSubmitted(text);
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('talentMarketplace.title')}
        subtitle={t('talentMarketplace.subtitle')}
      />

      <Card>
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(query);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('talentMarketplace.searchPlaceholder')}
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <Button type="submit">{t('talentMarketplace.search')}</Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {dict.talentMarketplace.sampleQueries.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => run(q)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600"
              >
                {q}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="mt-6">
        {employeesQuery.isLoading ? (
          <Spinner />
        ) : employeesQuery.isError ? (
          <ErrorState message={t('talentMarketplace.couldNotLoad')} />
        ) : !submitted ? (
          <EmptyState title={t('talentMarketplace.describe')} description={t('talentMarketplace.describeDesc')} />
        ) : !results.length ? (
          <EmptyState title={t('talentMarketplace.noMatches')} description={t('talentMarketplace.noMatchesDesc')} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((r) => (
              <TalentCard key={r.employee.id} match={r} departmentName={deptNameById.get(r.employee.department_id ?? '') ?? t('common.unassigned')} />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

const SENIORITY_TONE: BadgeTone = 'blue';

function TalentCard({ match, departmentName }: { match: TalentMatch; departmentName: string }) {
  const t = useT();
  const { employee, matchPct, matchedSkills, gapSkills, seniorityMatch } = match;
  const ringColor = matchPct >= 70 ? STATUS.good : matchPct >= 40 ? STATUS.warning : STATUS.critical;

  return (
    <Card>
      <CardBody>
        <div className="flex items-start gap-3">
          <div
            className="relative h-14 w-14 shrink-0 rounded-full"
            style={{ background: `conic-gradient(${ringColor} ${matchPct * 3.6}deg, #e2e8f0 0deg)` }}
          >
            <div className="absolute inset-1 flex items-center justify-center rounded-full bg-white text-xs font-bold text-slate-700">
              {matchPct}%
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800">{employee.full_name}</div>
            <div className="truncate text-xs text-slate-400">
              {employee.job_title} · {departmentName}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-500">
                {initials(employee.full_name)}
              </div>
              <Badge tone={seniorityMatch ? SENIORITY_TONE : 'amber'}>
                <span className="capitalize">{employee.seniority}</span>
                {!seniorityMatch && ` · ${t('talentMarketplace.belowLevel')}`}
              </Badge>
            </div>
          </div>
        </div>

        {matchedSkills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {matchedSkills.map((s) => (
              <Badge key={s} tone="green">{s}</Badge>
            ))}
          </div>
        )}
        {gapSkills.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {gapSkills.map((s) => (
              <Badge key={s} tone="amber">{s} {t('talentMarketplace.gapSuffix')}</Badge>
            ))}
          </div>
        )}

        <p className="mt-3 text-xs text-slate-400">{formatCurrency(employee.salary)} / yr</p>
      </CardBody>
    </Card>
  );
}
