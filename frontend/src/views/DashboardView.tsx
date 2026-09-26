import { Users, Building2, TrendingUp, Briefcase, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/lib/i18n';
import { PageContainer, PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Spinner, EmptyState, ErrorState } from '@/components/ui/Feedback';
import { ForecastLineChart } from '@/components/charts/ForecastLineChart';
import { Sparkline } from '@/components/charts/Sparkline';
import { CompetitorIntelFeed } from '@/components/CompetitorIntelFeed';
import {
  useAttendanceAnomalies,
  useDashboardSummary,
  useHeadcountForecast,
  useMyEmployee,
  useAttendance,
} from '@/hooks/queries';
import { formatDate, formatPercent } from '@/lib/utils';
import type { AttendanceAnomaly } from '@/types';

const SEVERITY_TONE: Record<AttendanceAnomaly['severity'], BadgeTone> = {
  watch: 'amber' as BadgeTone,
  warning: 'amber' as BadgeTone,
  critical: 'red' as BadgeTone,
};

export function DashboardView() {
  const { profile } = useAuthStore();
  if (profile?.role === 'employee') return <EmployeeDashboard />;
  return <AdminDashboard />;
}

function AdminDashboard() {
  const t = useT();
  const summary = useDashboardSummary();
  const anomalies = useAttendanceAnomalies();
  const forecast = useHeadcountForecast(6);

  return (
    <PageContainer>
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.adminSubtitle')} />

      <div className="mb-6">
        <CompetitorIntelFeed />
      </div>

      {summary.isLoading ? (
        <Spinner />
      ) : summary.isError ? (
        <ErrorState message={t('dashboard.couldNotLoadSummary')} />
      ) : summary.data ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile label={t('dashboard.activeHeadcount')} value={summary.data.headcount.toLocaleString()} icon={<Users size={18} />} />
          <StatTile label={t('dashboard.departments')} value={String(summary.data.departments)} icon={<Building2 size={18} />} />
          <StatTile label={t('dashboard.avgPerformance')} value={summary.data.avg_performance.toFixed(0)} icon={<TrendingUp size={18} />} />
          <StatTile label={t('dashboard.estOpenPositions')} value={String(summary.data.open_positions_estimate)} icon={<Briefcase size={18} />} />
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('dashboard.forecastTitle')}</CardTitle>
            <span className="text-xs text-slate-400">{t('dashboard.forecastSubtitle')}</span>
          </CardHeader>
          <CardBody>
            {forecast.isLoading ? (
              <Spinner />
            ) : forecast.isError ? (
              <ErrorState message={t('dashboard.couldNotLoadForecast')} />
            ) : forecast.data ? (
              <ForecastLineChart data={forecast.data} width={560} height={260} />
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.anomaliesTitle')}</CardTitle>
            <AlertTriangle size={16} className="text-amber-500" />
          </CardHeader>
          <CardBody className="max-h-[320px] overflow-y-auto scrollbar-thin">
            {anomalies.isLoading ? (
              <Spinner />
            ) : anomalies.isError ? (
              <ErrorState message={t('dashboard.couldNotLoadAnomalies')} />
            ) : !anomalies.data?.length ? (
              <EmptyState title={t('dashboard.noAnomalies')} description={t('dashboard.noAnomaliesDesc')} />
            ) : (
              <div className="space-y-3">
                {anomalies.data.map((a, i) => (
                  <div key={i} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">{a.department_name}</span>
                      <Badge tone={SEVERITY_TONE[a.severity]}>{t(`status.${a.severity}`)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {a.metric === 'absenteeism' ? t('dashboard.absenteeism') : t('dashboard.lateArrivals')} at {formatPercent(a.rate * 100)} vs.{' '}
                      {formatPercent(a.baseline_rate * 100)} baseline (z={a.z_score.toFixed(1)})
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {formatDate(a.window_start)} – {formatDate(a.window_end)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </PageContainer>
  );
}

function EmployeeDashboard() {
  const t = useT();
  const me = useMyEmployee();
  const attendance = useAttendance();

  if (me.isLoading) return <PageContainer><Spinner /></PageContainer>;
  if (me.isError || !me.data) return <PageContainer><ErrorState message={t('dashboard.couldNotLoadProfile')} /></PageContainer>;

  const emp = me.data;
  const myAttendance = attendance.data ?? [];
  const last14 = myAttendance.slice(-14);
  const counts = { present: 0, remote: 0, late: 0, absent: 0, pto: 0 };
  for (const a of myAttendance) counts[a.status]++;
  const hoursTrend = last14.map((a) => a.hours_worked);

  return (
    <PageContainer>
      <PageHeader title={t('dashboard.welcomeBack', { name: emp.full_name.split(' ')[0]! })} subtitle={emp.job_title} />

      <div className="mb-6">
        <CompetitorIntelFeed />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label={t('dashboard.ptoBalance')} value={`${emp.pto_balance.toFixed(1)} days`} />
        <StatTile label={t('dashboard.performanceScore')} value={emp.performance_score.toFixed(0)} />
        <StatTile label={t('dashboard.daysPresent')} value={String(counts.present)} />
        <StatTile label={t('dashboard.lateArrivalsStat')} value={String(counts.late)} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t('dashboard.hoursTrendTitle')}</CardTitle></CardHeader>
          <CardBody>
            {hoursTrend.length > 1 ? <Sparkline values={hoursTrend} width={220} height={48} /> : <EmptyState title={t('dashboard.notEnoughData')} />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('dashboard.skills')}</CardTitle></CardHeader>
          <CardBody className="flex flex-wrap gap-2">
            {emp.skills?.length ? (
              emp.skills.map((s) => (
                <Badge key={s.id} tone="blue">
                  {s.skill_name} · {s.proficiency}/5
                </Badge>
              ))
            ) : (
              <EmptyState title={t('dashboard.noSkills')} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('dashboard.careerSnapshot')}</CardTitle></CardHeader>
          <CardBody className="space-y-2 text-sm text-slate-600">
            <p>{t('dashboard.hired', { date: formatDate(emp.hire_date) })}</p>
            <p>{t('dashboard.seniority', { level: emp.seniority })}</p>
            <p>{t('dashboard.ptoUsedYtd', { days: emp.pto_used_ytd.toFixed(1) })}</p>
          </CardBody>
        </Card>
      </div>
    </PageContainer>
  );
}
