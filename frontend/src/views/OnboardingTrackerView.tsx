import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, Radio } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { PageContainer, PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/** `id` is the stable English event identifier used in the simulated Redis log (a real system wouldn't localize event payloads); nameKey/detailKey drive the translated UI. */
const STAGE_KEYS = [
  { id: 'HR Approved', nameKey: 'onboarding.stage1', detailKey: 'onboarding.stage1Detail' },
  { id: 'IT Equipment', nameKey: 'onboarding.stage2', detailKey: 'onboarding.stage2Detail' },
  { id: 'Accounts Created', nameKey: 'onboarding.stage3', detailKey: 'onboarding.stage3Detail' },
  { id: 'Training Scheduled', nameKey: 'onboarding.stage4', detailKey: 'onboarding.stage4Detail' },
  { id: 'Welcome', nameKey: 'onboarding.stage5', detailKey: 'onboarding.stage5Detail' },
] as const;

type StageStatus = 'pending' | 'in_progress' | 'completed';
const STAGE_DURATION_MS = 1600;

interface LogEntry {
  ts: string;
  message: string;
}

export function OnboardingTrackerView() {
  const t = useT();
  const [statuses, setStatuses] = useState<StageStatus[]>(() => STAGE_KEYS.map(() => 'pending'));
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timeouts.current.forEach(clearTimeout), []);

  function pushLog(message: string) {
    setLog((l) => [...l, { ts: new Date().toLocaleTimeString(), message }]);
  }

  function trigger() {
    if (running) return;
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
    setStatuses(STAGE_KEYS.map(() => 'pending'));
    setLog([]);
    setRunning(true);
    pushLog('redis:publish → channel "onboarding.events" → { type: "onboarding.started", hire: "John Doe" }');

    STAGE_KEYS.forEach((stage, i) => {
      const startAt = i * STAGE_DURATION_MS;
      timeouts.current.push(
        setTimeout(() => {
          setStatuses((s) => s.map((st, idx) => (idx === i ? 'in_progress' : st)));
          pushLog(`redis:publish → { type: "stage.started", stage: "${stage.id}" }`);
        }, startAt)
      );

      timeouts.current.push(
        setTimeout(() => {
          setStatuses((s) => s.map((st, idx) => (idx === i ? 'completed' : st)));
          pushLog(`redis:publish → { type: "stage.completed", stage: "${stage.id}" }`);
          if (i === STAGE_KEYS.length - 1) {
            pushLog('redis:publish → { type: "onboarding.completed", hire: "John Doe" }');
            setRunning(false);
          }
        }, startAt + STAGE_DURATION_MS * 0.7)
      );
    });
  }

  const allCompleted = statuses.every((s) => s === 'completed');

  return (
    <PageContainer>
      <PageHeader
        title={t('onboarding.title')}
        subtitle={t('onboarding.subtitle')}
        actions={
          <Button onClick={trigger} disabled={running}>
            {running ? t('onboarding.running') : allCompleted ? t('onboarding.retrigger') : t('onboarding.trigger')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('onboarding.hireHeading')}</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="space-y-0">
              {STAGE_KEYS.map((stage, i) => (
                <div key={stage.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <StageIcon status={statuses[i]!} />
                    {i < STAGE_KEYS.length - 1 && (
                      <div className={cn('w-px flex-1 min-h-[2.5rem]', statuses[i] === 'completed' ? 'bg-emerald-300' : 'bg-slate-200')} />
                    )}
                  </div>
                  <div className="pb-6">
                    <div
                      className={cn(
                        'text-sm font-medium',
                        statuses[i] === 'completed'
                          ? 'text-slate-800'
                          : statuses[i] === 'in_progress'
                            ? 'text-blue-700'
                            : 'text-slate-400'
                      )}
                    >
                      {t(stage.nameKey)}
                    </div>
                    <div className="text-xs text-slate-400">{t(stage.detailKey)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('onboarding.eventStream')}</CardTitle>
            <Radio size={15} className={running ? 'text-blue-500' : 'text-slate-300'} />
          </CardHeader>
          <CardBody className="max-h-[420px] overflow-y-auto scrollbar-thin">
            {!log.length ? (
              <p className="text-xs text-slate-400">{t('onboarding.noEvents')}</p>
            ) : (
              <div className="space-y-2 font-mono text-[11px] leading-relaxed text-slate-600">
                {log.map((entry, i) => (
                  <div key={i}>
                    <span className="text-slate-400">{entry.ts}</span> {entry.message}
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

function StageIcon({ status }: { status: StageStatus }) {
  if (status === 'completed') return <CheckCircle2 size={20} className="shrink-0 text-emerald-600" />;
  if (status === 'in_progress') {
    return (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-600" />
      </span>
    );
  }
  return <Circle size={20} className="shrink-0 text-slate-300" />;
}
