import { useState } from 'react';
import { Bot, Loader2, Send, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/lib/i18n';
import { useAskPolicyCopilot, useDashboardSummary, useMyEmployee } from '@/hooks/queries';
import { answerCoPilotQuery, coPilotActionKey, type CoPilotAction } from '@/lib/coPilotResponder';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  actions?: CoPilotAction[];
  sources?: { title: string; excerpt: string }[];
  pending?: boolean;
}

/** Floating chat widget, mounted once in App.tsx so it's reachable from every view. */
export function HrCoPilot() {
  const { profile } = useAuthStore();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: 'assistant', text: t('coPilot.greeting') },
  ]);

  const me = useMyEmployee(profile?.role !== 'admin');
  const summary = useDashboardSummary(profile?.role !== 'employee');
  const askPolicy = useAskPolicyCopilot();

  if (!profile) return null;

  function ask(text: string) {
    if (!text.trim()) return;
    setMessages((m) => [...m, { id: Date.now(), role: 'user', text }]);
    setInput('');
    const reply = answerCoPilotQuery(text, {
      employee: me.data ?? null,
      role: profile!.role,
      summary: summary.data ?? null,
    });

    if (reply.needsRag) {
      const pendingId = Date.now() + 1;
      setMessages((m) => [...m, { id: pendingId, role: 'assistant', text: t('coPilot.ragThinking'), pending: true }]);
      askPolicy.mutate(text, {
        onSuccess: (res) => {
          setMessages((m) => m.map((msg) => (msg.id === pendingId ? { id: pendingId, role: 'assistant', text: res.answer, sources: res.sources } : msg)));
        },
        onError: () => {
          setMessages((m) => m.map((msg) => (msg.id === pendingId ? { id: pendingId, role: 'assistant', text: t('coPilot.ragUnavailable') } : msg)));
        },
      });
      return;
    }

    const { extraKey, ...restParams } = reply.params ?? {};
    const resolvedParams = extraKey !== undefined ? { ...restParams, extra: extraKey ? t(String(extraKey)) : '' } : restParams;
    const replyText = t(reply.key, resolvedParams);
    window.setTimeout(() => {
      setMessages((m) => [...m, { id: Date.now() + 1, role: 'assistant', text: replyText, actions: reply.actions }]);
    }, 300);
  }

  function runAction(action: CoPilotAction) {
    setMessages((m) => [...m, { id: Date.now(), role: 'assistant', text: t(coPilotActionKey(action.kind)) }]);
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-blue-700"
        aria-label={t('coPilot.open')}
      >
        {open ? <X size={22} /> : <Bot size={22} />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-40 flex h-[480px] w-[360px] flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100">
              <Bot size={14} className="text-blue-600" />
            </div>
            <span className="text-sm font-semibold text-slate-800">{t('coPilot.title')}</span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2 text-xs',
                  m.role === 'user' ? 'ml-auto bg-blue-600 text-white' : 'bg-slate-50 text-slate-700'
                )}
              >
                <p className={cn('flex items-center gap-1.5', m.pending && 'text-slate-400')}>
                  {m.pending && <Loader2 size={11} className="animate-spin" />}
                  {m.text}
                </p>
                {m.sources?.length ? (
                  <div className="mt-2">
                    <p className="mb-1 text-[10px] font-medium text-slate-400">{t('coPilot.sourcesLabel')}</p>
                    <div className="flex flex-wrap gap-1">
                      {m.sources.map((s) => (
                        <Badge key={s.title} tone="slate" className="text-[10px]">{s.title}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {m.actions?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.actions.map((a) => (
                      <button
                        key={a.kind}
                        onClick={() => runAction(a)}
                        className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50"
                      >
                        {t(a.labelKey)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-center gap-2 border-t border-slate-100 p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('coPilot.placeholder')}
              className="flex-1 rounded-full border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700"
              aria-label={t('coPilot.send')}
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
