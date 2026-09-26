import { useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  CircleHelp,
  Clock,
  HeartPulse,
  Laptop2,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/lib/i18n';
import { PageContainer, PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/Feedback';
import { useCreateTicket, useEmployees, useMyEmployee, useTickets, useUpdateTicketStatus } from '@/hooks/queries';
import { analyzeSentiment, decideRouting, detectCategory, detectUrgency } from '@/lib/ml/sentiment';
import { cn, timeAgo } from '@/lib/utils';
import type { Ticket, TicketCategory, TicketStatus, TicketUrgency } from '@/types';

const STATUS_TONE: Record<TicketStatus, BadgeTone> = {
  open: 'blue',
  in_progress: 'amber',
  escalated: 'red',
  resolved: 'green',
  auto_resolved: 'violet',
};
const SENTIMENT_TONE: Record<string, BadgeTone> = { positive: 'green', neutral: 'slate', negative: 'red' };
const PRIORITY_TONE: Record<TicketUrgency, BadgeTone> = { low: 'slate', medium: 'blue', high: 'amber', critical: 'red' };

const CATEGORY_ORDER: TicketCategory[] = ['pto', 'benefits', 'payroll', 'it', 'facilities', 'conduct', 'other'];
const PRIORITY_ORDER: TicketUrgency[] = ['low', 'medium', 'high', 'critical'];
const PRIORITY_RANK: Record<TicketUrgency, number> = { low: 0, medium: 1, high: 2, critical: 3 };

const CATEGORY_ICON: Record<TicketCategory, LucideIcon> = {
  pto: CalendarDays,
  benefits: HeartPulse,
  payroll: Wallet,
  it: Laptop2,
  facilities: Building2,
  conduct: ShieldAlert,
  other: CircleHelp,
};

export function TicketsView() {
  const { profile } = useAuthStore();
  const t = useT();
  const isHrStaff = profile?.role === 'admin' || profile?.role === 'manager';
  const ticketsQuery = useTickets();
  const employeesQuery = useEmployees(isHrStaff);
  const updateStatus = useUpdateTicketStatus();
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employeesQuery.data ?? []) map.set(e.id, e.full_name);
    return map;
  }, [employeesQuery.data]);

  const sortedTickets = useMemo(() => {
    if (!ticketsQuery.data) return [];
    return [...ticketsQuery.data].sort((a, b) => PRIORITY_RANK[b.urgency] - PRIORITY_RANK[a.urgency]);
  }, [ticketsQuery.data]);

  return (
    <PageContainer>
      <PageHeader
        title={t('tickets.title')}
        subtitle={isHrStaff ? t('tickets.hrSubtitle') : t('tickets.employeeSubtitle')}
        actions={
          <Button onClick={() => setComposerOpen(true)}>
            <Plus size={15} /> {t('tickets.newRequest')}
          </Button>
        }
      />

      {ticketsQuery.isLoading ? (
        <Spinner />
      ) : ticketsQuery.isError ? (
        <ErrorState message={t('tickets.couldNotLoad')} />
      ) : !sortedTickets.length ? (
        <EmptyState title={t('tickets.noTickets')} description={t('tickets.noTicketsDesc')} />
      ) : (
        <div className="space-y-3">
          {sortedTickets.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              isHrStaff={isHrStaff}
              submitterName={isHrStaff ? employeeNameById.get(ticket.employee_id) : undefined}
              assigneeName={ticket.assigned_to ? employeeNameById.get(ticket.assigned_to) : undefined}
              onUpdateStatus={(status) => updateStatus.mutate({ id: ticket.id, status })}
              onOpen={isHrStaff ? () => setSelectedTicket(ticket) : undefined}
            />
          ))}
        </div>
      )}

      <TicketComposer open={composerOpen} onClose={() => setComposerOpen(false)} />

      <TicketDetailModal
        ticket={selectedTicket}
        submitterName={selectedTicket ? employeeNameById.get(selectedTicket.employee_id) : undefined}
        assigneeName={selectedTicket?.assigned_to ? employeeNameById.get(selectedTicket.assigned_to) : undefined}
        onClose={() => setSelectedTicket(null)}
        onUpdateStatus={(status) => {
          if (!selectedTicket) return;
          updateStatus.mutate({ id: selectedTicket.id, status });
          setSelectedTicket({ ...selectedTicket, status });
        }}
      />
    </PageContainer>
  );
}

function TicketRow({
  ticket,
  isHrStaff,
  submitterName,
  assigneeName,
  onUpdateStatus,
  onOpen,
}: {
  ticket: Ticket;
  isHrStaff: boolean;
  submitterName?: string;
  assigneeName?: string;
  onUpdateStatus: (s: TicketStatus) => void;
  onOpen?: () => void;
}) {
  const t = useT();
  return (
    <Card
      className={onOpen ? 'cursor-pointer transition-colors hover:border-blue-200' : undefined}
      onClick={onOpen}
    >
      <CardBody>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{ticket.subject}</h3>
              <Badge tone="slate">{t(`ticketCategory.${ticket.category}`)}</Badge>
              <Badge tone={PRIORITY_TONE[ticket.urgency]}>{t(`status.${ticket.urgency}`)}</Badge>
              {ticket.sentiment_label && <Badge tone={SENTIMENT_TONE[ticket.sentiment_label]}>{t(`status.${ticket.sentiment_label}`)}</Badge>}
              <Badge tone={STATUS_TONE[ticket.status]}>{t(`status.${ticket.status}`)}</Badge>
              {ticket.tier0_resolved && (
                <span className="flex items-center gap-1 text-xs font-medium text-violet-600">
                  <Sparkles size={12} /> {t('tickets.tier0')}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-slate-500">{ticket.description}</p>
            {ticket.resolution_note && (
              <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">{ticket.resolution_note}</p>
            )}
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
              <span>{timeAgo(ticket.created_at)}</span>
              {isHrStaff && submitterName && <span>· {t('tickets.submittedBy', { name: submitterName })}</span>}
              {ticket.sentiment_score != null && <span>· {t('tickets.sentimentScore', { score: ticket.sentiment_score.toFixed(2) })}</span>}
              {assigneeName && (
                <span className="flex items-center gap-1 font-medium text-blue-600">
                  <Send size={11} /> {t('tickets.assignedTo', { name: assigneeName })}
                </span>
              )}
            </p>
          </div>
          {isHrStaff && (
            <select
              value={ticket.status}
              onChange={(e) => onUpdateStatus(e.target.value as TicketStatus)}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
            >
              {(['open', 'in_progress', 'escalated', 'resolved', 'auto_resolved'] as TicketStatus[]).map((s) => (
                <option key={s} value={s}>{t(`status.${s}`)}</option>
              ))}
            </select>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function TicketDetailModal({
  ticket,
  submitterName,
  assigneeName,
  onClose,
  onUpdateStatus,
}: {
  ticket: Ticket | null;
  submitterName?: string;
  assigneeName?: string;
  onClose: () => void;
  onUpdateStatus: (s: TicketStatus) => void;
}) {
  const t = useT();
  if (!ticket) return null;
  const CategoryIcon = CATEGORY_ICON[ticket.category];

  return (
    <Modal open={!!ticket} onClose={onClose} title={ticket.subject} widthClassName="max-w-xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="slate"><CategoryIcon size={12} /> {t(`ticketCategory.${ticket.category}`)}</Badge>
          <Badge tone={PRIORITY_TONE[ticket.urgency]}>{t(`status.${ticket.urgency}`)}</Badge>
          {ticket.sentiment_label && <Badge tone={SENTIMENT_TONE[ticket.sentiment_label]}>{t(`status.${ticket.sentiment_label}`)}</Badge>}
          <Badge tone={STATUS_TONE[ticket.status]}>{t(`status.${ticket.status}`)}</Badge>
          {ticket.tier0_resolved && (
            <span className="flex items-center gap-1 text-xs font-medium text-violet-600">
              <Sparkles size={12} /> {t('tickets.tier0')}
            </span>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('tickets.description')}</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{ticket.description}</p>
        </div>

        {ticket.resolution_note && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('tickets.detailResolutionNote')}</p>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{ticket.resolution_note}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 text-sm">
          {submitterName && (
            <div>
              <p className="text-xs text-slate-400">{t('tickets.detailSubmittedBy')}</p>
              <p className="font-medium text-slate-700">{submitterName}</p>
            </div>
          )}
          {assigneeName && (
            <div>
              <p className="text-xs text-slate-400">{t('tickets.detailAssignedTo')}</p>
              <p className="flex items-center gap-1 font-medium text-blue-600"><Send size={12} /> {assigneeName}</p>
            </div>
          )}
          {ticket.sentiment_score != null && (
            <div>
              <p className="text-xs text-slate-400">{t('tickets.detailSentiment')}</p>
              <p className="font-medium text-slate-700">{ticket.sentiment_score.toFixed(2)}</p>
            </div>
          )}
          <div>
            <p className="flex items-center gap-1 text-xs text-slate-400"><Clock size={11} /> {t('tickets.detailCreated')}</p>
            <p className="font-medium text-slate-700">{timeAgo(ticket.created_at)}</p>
          </div>
          {ticket.resolved_at && (
            <div>
              <p className="text-xs text-slate-400">{t('tickets.detailResolvedAt')}</p>
              <p className="font-medium text-slate-700">{timeAgo(ticket.resolved_at)}</p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{t('tickets.detailUpdateStatus')}</span>
            <select
              value={ticket.status}
              onChange={(e) => onUpdateStatus(e.target.value as TicketStatus)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {(['open', 'in_progress', 'escalated', 'resolved', 'auto_resolved'] as TicketStatus[]).map((s) => (
                <option key={s} value={s}>{t(`status.${s}`)}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={onClose}>{t('tickets.close')}</Button>
        </div>
      </div>
    </Modal>
  );
}

function TicketComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory | null>(null);
  const [priority, setPriority] = useState<TicketUrgency | null>(null);
  const createTicket = useCreateTicket();
  const myEmployeeQuery = useMyEmployee(open);

  const preview = useMemo(() => {
    const text = `${subject}. ${description}`.trim();
    if (text.length < 5) return null;
    const sentiment = analyzeSentiment(text);
    const urgency = detectUrgency(text);
    const suggestedCategory = detectCategory(text);
    const routing = decideRouting(urgency, sentiment, suggestedCategory);
    return { sentiment, urgency, category: suggestedCategory, routing };
  }, [subject, description]);

  const managerName = myEmployeeQuery.data?.manager_name ?? null;

  async function handleSubmit() {
    await createTicket.mutateAsync({
      subject,
      description,
      category: category ?? undefined,
      priority: priority ?? undefined,
    });
    setSubject('');
    setDescription('');
    setCategory(null);
    setPriority(null);
    onClose();
  }

  function handleClose() {
    setSubject('');
    setDescription('');
    setCategory(null);
    setPriority(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title={t('tickets.newRequest')} widthClassName="max-w-2xl">
      <div className="space-y-5">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('tickets.step1')}</p>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-600">{t('tickets.subject')}</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              placeholder={t('tickets.subjectPlaceholder')}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-600">{t('tickets.description')}</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              placeholder={t('tickets.descriptionPlaceholder')}
            />
          </label>
        </div>

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('tickets.step2')}</p>

          <div>
            <span className="mb-2 block text-sm text-slate-600">{t('tickets.ticketType')}</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CATEGORY_ORDER.map((c) => {
                const Icon = CATEGORY_ICON[c];
                const isSelected = category === c;
                const isSuggested = !category && preview?.category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      'relative flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center text-xs font-medium transition-colors',
                      isSelected
                        ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                        : isSuggested
                          ? 'border-dashed border-blue-300 bg-blue-50/50 text-blue-600'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    )}
                  >
                    {isSuggested && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                        {t('tickets.suggested')}
                      </span>
                    )}
                    <Icon size={18} />
                    {t(`ticketCategory.${c}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-sm text-slate-600">{t('tickets.priority')}</span>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITY_ORDER.map((p) => {
                const isSelected = priority === p;
                const isSuggested = !priority && preview?.urgency === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-xs font-semibold capitalize transition-colors',
                      isSelected || isSuggested
                        ? {
                            low: 'border-slate-400 bg-slate-100 text-slate-700',
                            medium: 'border-blue-400 bg-blue-50 text-blue-700',
                            high: 'border-amber-400 bg-amber-50 text-amber-700',
                            critical: 'border-red-400 bg-red-50 text-red-700',
                          }[p]
                        : 'border-slate-200 text-slate-500 hover:border-slate-300',
                      !isSelected && isSuggested && 'border-dashed'
                    )}
                  >
                    {t(`status.${p}`)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-700">
          <Send size={14} className="mt-0.5 shrink-0" />
          <span>{managerName ? t('tickets.routesToManager', { name: managerName }) : t('tickets.noManagerNote')}</span>
        </div>

        {preview && (
          <div className="rounded-lg border border-dashed border-slate-200 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Sparkles size={13} /> {t('tickets.livePreview')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={SENTIMENT_TONE[preview.sentiment.label]}>{t(`status.${preview.sentiment.label}`)} ({preview.sentiment.score.toFixed(2)})</Badge>
              {preview.routing.escalate && <Badge tone="red">{t('tickets.willEscalate')}</Badge>}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={handleClose} className="flex-1">
            {t('tickets.close')}
          </Button>
          <Button onClick={handleSubmit} disabled={!subject || !description || createTicket.isPending} className="flex-1">
            {createTicket.isPending ? t('tickets.submitting') : t('tickets.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
