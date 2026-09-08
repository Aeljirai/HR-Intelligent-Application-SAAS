import { useMemo, useState } from 'react';
import { HeartHandshake, Users, CalendarClock, Check, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/lib/i18n';
import { PageContainer, PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/Feedback';
import {
  useCreateWellbeingRequest,
  useMyEmployee,
  useUpdateWellbeingRequestStatus,
  useWellbeingClubs,
  useWellbeingRequests,
} from '@/hooks/queries';
import { formatDate } from '@/lib/utils';
import type { WellbeingClub, WellbeingRequest, WellbeingRequestStatus } from '@/types';

const STATUS_TONE: Record<WellbeingRequestStatus, BadgeTone> = {
  pending: 'amber',
  approved: 'green',
  declined: 'red',
  scheduled: 'violet',
};

/** ISO string -> "YYYY-MM-DDTHH:mm" in local time, for pre-filling a datetime-local input. */
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function WellbeingView() {
  const { profile } = useAuthStore();
  const t = useT();
  const role = profile?.role ?? 'employee';
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';

  const myEmployeeQuery = useMyEmployee(!isAdmin);
  const clubsQuery = useWellbeingClubs();
  const requestsQuery = useWellbeingRequests();
  const updateStatus = useUpdateWellbeingRequestStatus();

  const [supportOpen, setSupportOpen] = useState(false);
  const [joinTarget, setJoinTarget] = useState<WellbeingClub | null>(null);

  const myEmployeeId = myEmployeeQuery.data?.id;
  const allRequests = requestsQuery.data ?? [];
  const myRequests = useMemo(() => allRequests.filter((r) => r.employee_id === myEmployeeId), [allRequests, myEmployeeId]);
  const otherRequests = useMemo(() => allRequests.filter((r) => r.employee_id !== myEmployeeId), [allRequests, myEmployeeId]);

  const activeClubIds = useMemo(
    () =>
      new Set(
        myRequests
          .filter((r) => r.type === 'club_join' && r.status !== 'declined')
          .map((r) => r.club_id)
      ),
    [myRequests]
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('wellbeing.title')}
        subtitle={isAdmin ? t('wellbeing.subtitleAdmin') : isManager ? t('wellbeing.subtitleManager') : t('wellbeing.subtitleEmployee')}
      />

      <Card>
        <CardBody className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <HeartHandshake size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{t('wellbeing.supportTitle')}</p>
              <p className="text-xs text-slate-500">{t('wellbeing.supportDesc')}</p>
            </div>
          </div>
          <Button onClick={() => setSupportOpen(true)}>{t('wellbeing.requestSupport')}</Button>
        </CardBody>
      </Card>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('wellbeing.clubsTitle')}</h2>
        {clubsQuery.isLoading ? (
          <Spinner />
        ) : clubsQuery.isError ? (
          <ErrorState message={t('wellbeing.couldNotLoadClubs')} />
        ) : !clubsQuery.data?.length ? (
          <EmptyState title={t('wellbeing.noClubs')} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clubsQuery.data.map((club) => (
              <ClubCard key={club.id} club={club} alreadyRequested={activeClubIds.has(club.id)} onRequestJoin={() => setJoinTarget(club)} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('wellbeing.myRequestsTitle')}</h2>
        {requestsQuery.isLoading ? (
          <Spinner />
        ) : requestsQuery.isError ? (
          <ErrorState message={t('wellbeing.couldNotLoadRequests')} />
        ) : !myRequests.length ? (
          <EmptyState title={t('wellbeing.noRequests')} description={t('wellbeing.noRequestsDesc')} />
        ) : (
          <div className="space-y-3">
            {myRequests.map((r) => (
              <RequestRow key={r.id} request={r} showRequester={false} />
            ))}
          </div>
        )}
      </div>

      {isManager && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('wellbeing.teamRequestsTitle')}</h2>
          {!otherRequests.length ? (
            <EmptyState title={t('wellbeing.noTeamRequests')} description={t('wellbeing.noTeamRequestsDesc')} />
          ) : (
            <div className="space-y-3">
              {otherRequests.map((r) => (
                <RequestRow key={r.id} request={r} showRequester />
              ))}
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('wellbeing.allRequestsTitle')}</h2>
          {!otherRequests.length ? (
            <EmptyState title={t('wellbeing.noAllRequests')} description={t('wellbeing.noAllRequestsDesc')} />
          ) : (
            <div className="space-y-3">
              {otherRequests.map((r) => (
                <RequestRow
                  key={r.id}
                  request={r}
                  showRequester
                  onUpdate={(payload) => updateStatus.mutate({ id: r.id, ...payload })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
      <JoinModal club={joinTarget} onClose={() => setJoinTarget(null)} />
    </PageContainer>
  );
}

function ClubCard({ club, alreadyRequested, onRequestJoin }: { club: WellbeingClub; alreadyRequested: boolean; onRequestJoin: () => void }) {
  const t = useT();
  return (
    <Card>
      <CardBody>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Users size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{club.name}</h3>
              <Badge tone="slate">{club.category}</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">{club.description}</p>
            {club.meeting_schedule && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
                <CalendarClock size={12} /> {club.meeting_schedule}
              </p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant={alreadyRequested ? 'secondary' : 'primary'}
          disabled={alreadyRequested}
          onClick={onRequestJoin}
          className="mt-3 w-full"
        >
          {alreadyRequested ? t('wellbeing.alreadyRequested') : t('wellbeing.requestToJoin')}
        </Button>
      </CardBody>
    </Card>
  );
}

function RequestRow({
  request,
  showRequester,
  onUpdate,
}: {
  request: WellbeingRequest;
  showRequester: boolean;
  onUpdate?: (payload: { status: WellbeingRequestStatus; scheduled_at?: string; reviewer_note?: string }) => void;
}) {
  const t = useT();
  const [note, setNote] = useState('');
  const [schedulingOpen, setSchedulingOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  const title = request.type === 'club_join' ? (request.club?.name ?? t('wellbeing.clubJoinLabel')) : t('wellbeing.supportLabel');
  const Icon = request.type === 'club_join' ? Users : HeartHandshake;

  function confirmSchedule() {
    if (!scheduledAt || !onUpdate) return;
    onUpdate({ status: 'scheduled', scheduled_at: new Date(scheduledAt).toISOString(), reviewer_note: note || undefined });
    setSchedulingOpen(false);
  }

  function toggleScheduling() {
    setSchedulingOpen((open) => {
      const next = !open;
      if (next && !scheduledAt && request.status === 'scheduled' && request.scheduled_at) {
        setScheduledAt(toDatetimeLocalValue(request.scheduled_at));
      }
      return next;
    });
  }

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Icon size={14} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
              <Badge tone={STATUS_TONE[request.status]}>{t(`status.${request.status}`)}</Badge>
            </div>
            {showRequester && request.employee && (
              <p className="mt-1 text-xs text-slate-500">{request.employee.full_name} · {request.employee.job_title}</p>
            )}
            {request.note && <p className="mt-1.5 text-sm text-slate-500">{request.note}</p>}
            {request.status === 'scheduled' && request.scheduled_at && (
              <p className="mt-1.5 text-xs font-medium text-violet-600">{t('wellbeing.scheduledFor', { date: formatDate(request.scheduled_at) })}</p>
            )}
            {request.reviewer_note && (
              <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-medium">{t('wellbeing.reviewerNoteLabel')}: </span>{request.reviewer_note}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400">{formatDate(request.created_at)}</p>
          </div>

          {onUpdate && (
            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="flex gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => onUpdate({ status: 'approved', reviewer_note: note || undefined })}>
                  <Check size={13} className="text-emerald-600" /> {t('wellbeing.approve')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onUpdate({ status: 'declined', reviewer_note: note || undefined })}>
                  <X size={13} className="text-red-600" /> {t('wellbeing.decline')}
                </Button>
                <Button size="sm" variant="secondary" onClick={toggleScheduling}>
                  <CalendarClock size={13} className="text-violet-600" />
                  {request.status === 'scheduled' ? t('wellbeing.reschedule') : t('wellbeing.schedule')}
                </Button>
              </div>
              {schedulingOpen && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  />
                  <Button size="sm" onClick={confirmSchedule} disabled={!scheduledAt}>{t('wellbeing.confirm')}</Button>
                </div>
              )}
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('wellbeing.addNotePlaceholder')}
                className="w-48 rounded-md border border-slate-200 px-2 py-1 text-xs"
              />
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function SupportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [note, setNote] = useState('');
  const createRequest = useCreateWellbeingRequest();

  async function handleSubmit() {
    await createRequest.mutateAsync({ type: 'psychiatric_support', note: note || undefined });
    setNote('');
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t('wellbeing.supportModalTitle')}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">{t('wellbeing.supportNoteLabel')}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder={t('wellbeing.supportNotePlaceholder')}
          />
        </label>
        <Button onClick={handleSubmit} disabled={createRequest.isPending} className="w-full">
          {createRequest.isPending ? t('wellbeing.submitting') : t('wellbeing.submitRequest')}
        </Button>
      </div>
    </Modal>
  );
}

function JoinModal({ club, onClose }: { club: WellbeingClub | null; onClose: () => void }) {
  const t = useT();
  const [note, setNote] = useState('');
  const createRequest = useCreateWellbeingRequest();

  async function handleSubmit() {
    if (!club) return;
    await createRequest.mutateAsync({ type: 'club_join', club_id: club.id, note: note || undefined });
    setNote('');
    onClose();
  }

  return (
    <Modal open={!!club} onClose={onClose} title={club ? t('wellbeing.joinModalTitle', { club: club.name }) : ''}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">{t('wellbeing.joinNoteLabel')}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <Button onClick={handleSubmit} disabled={createRequest.isPending} className="w-full">
          {createRequest.isPending ? t('wellbeing.submitting') : t('wellbeing.submitRequest')}
        </Button>
      </div>
    </Modal>
  );
}
