import { useMemo, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/lib/i18n';
import { PageContainer, PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner, ErrorState, EmptyState } from '@/components/ui/Feedback';
import { useCreateTicket, useTickets, useUpdateTicketStatus } from '@/hooks/queries';
import { analyzeSentiment, decideRouting, detectCategory, detectUrgency } from '@/lib/ml/sentiment';
import { timeAgo } from '@/lib/utils';
import type { Ticket, TicketStatus } from '@/types';

const STATUS_TONE: Record<TicketStatus, BadgeTone> = {
  open: 'blue',
  in_progress: 'amber',
  escalated: 'red',
  resolved: 'green',
  auto_resolved: 'violet',
};
const SENTIMENT_TONE: Record<string, BadgeTone> = { positive: 'green', neutral: 'slate', negative: 'red' };

export function TicketsView() {
  const { profile } = useAuthStore();
  const t = useT();
  const isHrStaff = profile?.role === 'admin' || profile?.role === 'manager';
  const ticketsQuery = useTickets();
  const updateStatus = useUpdateTicketStatus();
  const [composerOpen, setComposerOpen] = useState(false);

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
      ) : !ticketsQuery.data?.length ? (
        <EmptyState title={t('tickets.noTickets')} description={t('tickets.noTicketsDesc')} />
      ) : (
        <div className="space-y-3">
          {ticketsQuery.data.map((t) => (
            <TicketRow key={t.id} ticket={t} isHrStaff={isHrStaff} onUpdateStatus={(status) => updateStatus.mutate({ id: t.id, status })} />
          ))}
        </div>
      )}

      <TicketComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
    </PageContainer>
  );
}

function TicketRow({ ticket, isHrStaff, onUpdateStatus }: { ticket: Ticket; isHrStaff: boolean; onUpdateStatus: (s: TicketStatus) => void }) {
  const t = useT();
  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{ticket.subject}</h3>
              <Badge tone="slate">{ticket.category}</Badge>
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
            <p className="mt-2 text-xs text-slate-400">
              {timeAgo(ticket.created_at)} · {t('tickets.urgencyLabel', { level: t(`status.${ticket.urgency}`) })}
              {ticket.sentiment_score != null && ` · ${t('tickets.sentimentScore', { score: ticket.sentiment_score.toFixed(2) })}`}
            </p>
          </div>
          {isHrStaff && (
            <select
              value={ticket.status}
              onChange={(e) => onUpdateStatus(e.target.value as TicketStatus)}
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

function TicketComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const createTicket = useCreateTicket();

  const preview = useMemo(() => {
    const text = `${subject}. ${description}`.trim();
    if (text.length < 5) return null;
    const sentiment = analyzeSentiment(text);
    const urgency = detectUrgency(text);
    const category = detectCategory(text);
    const routing = decideRouting(urgency, sentiment, category);
    return { sentiment, urgency, category, routing };
  }, [subject, description]);

  async function handleSubmit() {
    await createTicket.mutateAsync({ subject, description });
    setSubject('');
    setDescription('');
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t('tickets.newRequest')} widthClassName="max-w-xl">
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">{t('tickets.subject')}</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder={t('tickets.subjectPlaceholder')}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-600">{t('tickets.description')}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder={t('tickets.descriptionPlaceholder')}
          />
        </label>

        {preview && (
          <div className="rounded-lg border border-dashed border-slate-200 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Sparkles size={13} /> {t('tickets.livePreview')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={SENTIMENT_TONE[preview.sentiment.label]}>{t(`status.${preview.sentiment.label}`)} ({preview.sentiment.score.toFixed(2)})</Badge>
              <Badge tone="slate">{preview.category}</Badge>
              <Badge tone={preview.urgency === 'critical' || preview.urgency === 'high' ? 'red' : 'slate'}>{t(`status.${preview.urgency}`)} {t('common.urgency')}</Badge>
              {preview.routing.escalate && <Badge tone="red">{t('tickets.willEscalate')}</Badge>}
            </div>
          </div>
        )}

        <Button onClick={handleSubmit} disabled={!subject || !description || createTicket.isPending} className="w-full">
          {createTicket.isPending ? t('tickets.submitting') : t('tickets.submit')}
        </Button>
      </div>
    </Modal>
  );
}
