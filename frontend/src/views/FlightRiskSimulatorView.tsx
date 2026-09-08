import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { PageContainer, PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/Feedback';
import { Gauge } from '@/components/charts/Gauge';
import { useDepartments, useEmployees, useFlightRiskCounterfactuals } from '@/hooks/queries';
import { computeFlightRisk } from '@/lib/ml/flightRisk';
import { initials } from '@/lib/utils';
import type { Employee, FlightRiskLeverSuggestion } from '@/types';

const RISK_TONE: Record<string, BadgeTone> = { low: 'green', moderate: 'amber', high: 'amber', severe: 'red' };

export function FlightRiskSimulatorView() {
  const t = useT();
  const employeesQuery = useEmployees();
  const departmentsQuery = useDepartments();
  const [selected, setSelected] = useState<Employee | null>(null);

  const employees = employeesQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];
  const deptNameById = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const ranked = useMemo(
    () =>
      employees
        .filter((e) => e.status === 'active' && e.flight_risk)
        .sort((a, b) => (b.flight_risk!.score ?? 0) - (a.flight_risk!.score ?? 0)),
    [employees]
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('flightRisk.title')}
        subtitle={t('flightRisk.subtitle')}
      />

      {employeesQuery.isLoading ? (
        <Spinner />
      ) : employeesQuery.isError ? (
        <ErrorState message={t('employees.couldNotLoad')} />
      ) : !ranked.length ? (
        <EmptyState title={t('flightRisk.noActive')} />
      ) : (
        <Card>
          <CardBody className="divide-y divide-slate-100 p-0">
            {ranked.map((e, i) => (
              <button
                key={e.id}
                onClick={() => setSelected(e)}
                className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-slate-50"
              >
                <span className="w-5 text-xs text-slate-400">{i + 1}</span>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                  {initials(e.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">{e.full_name}</div>
                  <div className="truncate text-xs text-slate-400">
                    {e.job_title} · {deptNameById.get(e.department_id ?? '') ?? t('common.unassigned')}
                  </div>
                </div>
                <Badge tone={RISK_TONE[e.flight_risk!.band]}>
                  {e.flight_risk!.score.toFixed(0)} · {t(`status.${e.flight_risk!.band}`)}
                </Badge>
              </button>
            ))}
          </CardBody>
        </Card>
      )}

      {selected && <SimulatorModal employee={selected} onClose={() => setSelected(null)} />}
    </PageContainer>
  );
}

const LEVER_LABEL_KEY: Record<FlightRiskLeverSuggestion['lever'], string> = {
  overtimeHoursMonth: 'flightRisk.overtimeSlider',
  daysSinceVacation: 'flightRisk.vacationSlider',
  salary: 'flightRisk.salarySlider',
};
const LEVER_UNIT: Record<FlightRiskLeverSuggestion['lever'], string> = {
  overtimeHoursMonth: ' hrs',
  daysSinceVacation: ' days',
  salary: ' / yr',
};

function SimulatorModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const t = useT();
  const [overtimeHoursMonth, setOvertimeHoursMonth] = useState(employee.overtime_hours_month);
  const [daysSinceVacation, setDaysSinceVacation] = useState(employee.days_since_vacation);
  const [salary, setSalary] = useState(employee.salary);
  const counterfactuals = useFlightRiskCounterfactuals();

  const salaryMin = Math.max(20000, Math.round((employee.salary * 0.6) / 1000) * 1000);
  const salaryMax = Math.round((employee.salary * 1.4) / 1000) * 1000;

  const result = useMemo(
    () => computeFlightRisk(employee, { overtimeHoursMonth, daysSinceVacation, salary }),
    [employee, overtimeHoursMonth, daysSinceVacation, salary]
  );
  const currentResult = useMemo(() => computeFlightRisk(employee), [employee]);

  function reset() {
    setOvertimeHoursMonth(employee.overtime_hours_month);
    setDaysSinceVacation(employee.days_since_vacation);
    setSalary(employee.salary);
  }

  function applySuggestion(s: FlightRiskLeverSuggestion) {
    if (s.suggestedValue == null) return;
    if (s.lever === 'overtimeHoursMonth') setOvertimeHoursMonth(s.suggestedValue);
    if (s.lever === 'daysSinceVacation') setDaysSinceVacation(s.suggestedValue);
    if (s.lever === 'salary') setSalary(s.suggestedValue);
  }

  return (
    <Modal open onClose={onClose} title={employee.full_name} widthClassName="max-w-3xl">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <div className="flex flex-col items-center rounded-lg border border-slate-100 py-4">
            <Gauge value={result.score} label={t(`status.${result.band}`)} />
          </div>

          <div className="mt-5 space-y-5">
            <Slider label={t('flightRisk.overtimeSlider')} value={overtimeHoursMonth} min={0} max={60} unit=" hrs" onChange={setOvertimeHoursMonth} />
            <Slider label={t('flightRisk.vacationSlider')} value={daysSinceVacation} min={0} max={365} step={5} unit=" days" onChange={setDaysSinceVacation} />
            <Slider label={t('flightRisk.salarySlider')} value={salary} min={salaryMin} max={salaryMax} step={1000} unit=" / yr" onChange={setSalary} />
            <Button variant="secondary" size="sm" onClick={reset}>{t('flightRisk.reset')}</Button>
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">{t('flightRisk.contributingFactors')}</h4>
          <div className="space-y-1.5">
            {result.factors.map((f) => (
              <div key={f.factor} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                <div>
                  <div className="font-medium text-slate-700">{f.label}</div>
                  <div className="text-slate-400">{f.detail}</div>
                </div>
                <span className="font-semibold text-slate-600">{t('common.impact', { value: f.impact.toFixed(1) })}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-slate-400">{t('flightRisk.footnote')}</p>

          {currentResult.band !== 'low' && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              {!counterfactuals.data ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => counterfactuals.mutate(employee.id)}
                  disabled={counterfactuals.isPending}
                >
                  <Sparkles size={13} className="text-violet-600" />
                  {counterfactuals.isPending ? t('flightRisk.loadingCounterfactuals') : t('flightRisk.showCounterfactuals')}
                </Button>
              ) : (
                <>
                  <h4 className="mb-2 text-sm font-semibold text-slate-700">{t('flightRisk.counterfactualsTitle')}</h4>
                  <div className="space-y-1.5">
                    {counterfactuals.data.suggestions.map((s) => (
                      <div key={s.lever} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                        {s.suggestedValue == null ? (
                          <span className="text-slate-400">
                            {t('flightRisk.counterfactualNone', { label: t(LEVER_LABEL_KEY[s.lever]) })}
                          </span>
                        ) : (
                          <>
                            <span className="text-slate-600">
                              {t('flightRisk.counterfactualSuggestion', {
                                label: t(LEVER_LABEL_KEY[s.lever]),
                                value: `${s.suggestedValue}${LEVER_UNIT[s.lever]}`,
                                band: t(`status.${s.achievesBand}`),
                              })}
                            </span>
                            <Button size="sm" variant="secondary" onClick={() => applySuggestion(s)}>
                              {t('flightRisk.apply')}
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {counterfactuals.isError && <ErrorState message={t('flightRisk.couldNotLoadCounterfactuals')} />}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
