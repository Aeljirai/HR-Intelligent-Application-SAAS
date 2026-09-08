import { useState } from 'react';
import { Bot, Send, User } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { PageContainer, PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { HorizontalBarChart } from '@/components/charts/HorizontalBarChart';
import { useAgentCommand } from '@/hooks/queries';
import type { AgentCommand, AgentResult } from '@/types';

interface Message {
  role: 'user' | 'agent';
  text?: string;
  command?: AgentCommand;
  result?: AgentResult;
}

const SUGGESTIONS = [
  'Approve all pending leave requests for Engineering',
  'Show compensation gap',
  'How many employees are in Sales?',
  'How many open tickets are there?',
];

export function AgentView() {
  const t = useT();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'agent', text: t('agent.greeting') },
  ]);
  const [input, setInput] = useState('');
  const command = useAgentCommand();

  async function send(text: string) {
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    const response = await command.mutateAsync(text);
    setMessages((m) => [...m, { role: 'agent', command: response.command, result: response.result }]);
  }

  return (
    <PageContainer>
      <PageHeader title={t('agent.title')} subtitle={t('agent.subtitle')} />

      <Card className="flex h-[600px] flex-col">
        <CardBody className="flex flex-1 flex-col overflow-hidden p-0">
          <div className="flex-1 space-y-4 overflow-y-auto p-5 scrollbar-thin">
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}
            {command.isPending && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Bot size={14} /> {t('agent.thinking')}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600"
                >
                  {s}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('agent.placeholder')}
                className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button type="submit" className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700">
                <Send size={16} />
              </button>
            </form>
          </div>
        </CardBody>
      </Card>
    </PageContainer>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const t = useT();
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-slate-200' : 'bg-blue-100'}`}>
        {isUser ? <User size={14} className="text-slate-600" /> : <Bot size={14} className="text-blue-600" />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${isUser ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-700'}`}>
        {message.text && <p>{message.text}</p>}

        {message.command && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
            <Badge tone="violet">{message.command.intent}</Badge>
            <Badge tone="slate">{message.command.action}</Badge>
            <span className="text-slate-400">{t('agent.confidence', { pct: Math.round(message.command.confidence * 100) })}</span>
          </div>
        )}

        {message.result?.kind === 'text' && <p>{message.result.message}</p>}
        {message.result?.kind === 'action_confirmation' && (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-700">{message.result.message}</p>
        )}
        {message.result?.kind === 'chart' && <ChartResult result={message.result} />}
      </div>
    </div>
  );
}

function ChartResult({ result }: { result: AgentResult }) {
  const payload = result.payload as { data: { full_name: string; gap_pct: number }[] } | undefined;
  if (!payload?.data) return <p>{result.message}</p>;
  return (
    <div>
      <p className="mb-2 text-slate-600">{result.message}</p>
      <HorizontalBarChart
        data={payload.data.map((d) => ({ label: d.full_name, value: d.gap_pct }))}
        width={380}
        valueFormatter={(v) => `${v.toFixed(1)}%`}
      />
    </div>
  );
}
