import type { Employee, TicketCategory, TicketUrgency } from '../types.js';

// ---------------------------------------------------------------------
// Lexicon-based sentiment analysis (no external NLP dependency — trades
// nuance for full transparency & zero network/model cost, appropriate for
// short HR ticket text).
// ---------------------------------------------------------------------
const POSITIVE_WORDS = [
  'thanks', 'thank', 'great', 'appreciate', 'good', 'love', 'happy', 'awesome',
  'excellent', 'pleased', 'glad', 'wonderful', 'helpful', 'resolved', 'perfect',
];
const NEGATIVE_WORDS = [
  'angry', 'frustrated', 'unacceptable', 'terrible', 'worst', 'awful', 'broken',
  'never', 'ignored', 'delay', 'delayed', 'wrong', 'mistake', 'issue', 'problem',
  'disappointed', 'upset', 'unfair', 'harassment', 'discriminat', 'hostile',
  'complain', 'complaint', 'threat', 'legal', 'lawsuit', 'quit', 'resign',
];

const CRITICAL_KEYWORDS = [
  'harassment', 'discriminat', 'hostile', 'threat', 'lawsuit', 'legal action',
  'emergency', 'unsafe', 'assault', 'suicide', 'self harm',
];
const HIGH_KEYWORDS = [
  'urgent', 'immediately', 'asap', 'today', 'unacceptable', 'angry', 'frustrated',
  'deadline', 'escalate', 'manager', 'quit', 'resign',
];

const CATEGORY_KEYWORDS: Record<TicketCategory, string[]> = {
  pto: ['pto', 'vacation', 'time off', 'leave balance', 'sick day', 'paid leave'],
  benefits: ['benefits', 'health insurance', 'dental', 'vision', 'enrollment', '401k', '401(k)', 'retirement'],
  payroll: ['payroll', 'paycheck', 'direct deposit', 'salary', 'pay stub', 'tax form', 'w-2', 'w2', 'garnish'],
  it: ['laptop', 'password', 'vpn', 'software', 'access', 'login', 'wifi', 'computer', 'account locked'],
  facilities: ['desk', 'office', 'parking', 'badge', 'building', 'hvac', 'air condition'],
  conduct: ['harassment', 'discriminat', 'hostile', 'bully', 'conduct', 'inappropriate'],
  other: [],
};

export interface SentimentResult {
  label: 'positive' | 'neutral' | 'negative';
  score: number; // -1..1
}

export function analyzeSentiment(text: string): SentimentResult {
  const words = tokenize(text);
  let pos = 0;
  let neg = 0;
  for (const w of words) {
    if (POSITIVE_WORDS.some((p) => w.includes(p))) pos++;
    if (NEGATIVE_WORDS.some((n) => w.includes(n))) neg++;
  }
  const total = pos + neg;
  const raw = total === 0 ? 0 : (pos - neg) / total;
  const score = Math.round(raw * 1000) / 1000;
  const label: SentimentResult['label'] = score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral';
  return { label, score };
}

export function detectUrgency(text: string): TicketUrgency {
  const lower = text.toLowerCase();
  if (CRITICAL_KEYWORDS.some((k) => lower.includes(k))) return 'critical';
  if (HIGH_KEYWORDS.some((k) => lower.includes(k))) return 'high';
  const { label } = analyzeSentiment(text);
  return label === 'negative' ? 'medium' : 'low';
}

export function detectCategory(text: string): TicketCategory {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [
    TicketCategory,
    string[],
  ][]) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return 'other';
}

export interface RoutingDecision {
  escalate: boolean;
  queue: 'tier0' | 'standard' | 'escalation';
  reason: string;
}

export function decideRouting(
  urgency: TicketUrgency,
  sentiment: SentimentResult,
  category: TicketCategory
): RoutingDecision {
  if (urgency === 'critical' || category === 'conduct') {
    return { escalate: true, queue: 'escalation', reason: 'Critical urgency or conduct-related content' };
  }
  if (urgency === 'high' && sentiment.label === 'negative') {
    return { escalate: true, queue: 'escalation', reason: 'High urgency combined with negative sentiment' };
  }
  return { escalate: false, queue: 'standard', reason: 'Within normal handling parameters' };
}

// ---------------------------------------------------------------------
// Tier-0 auto-resolution: a handful of self-service HR questions get an
// instant, personalized answer without a human ever touching the ticket.
// ---------------------------------------------------------------------
export interface Tier0Result {
  resolved: boolean;
  note?: string;
}

export function attemptTier0Resolution(text: string, employee: Pick<Employee, 'pto_balance' | 'pto_used_ytd'>): Tier0Result {
  const lower = text.toLowerCase();

  if (/(pto|vacation|time off).*(balance|left|remaining|how many)/.test(lower) ||
      /(how many|what).*(pto|vacation days)/.test(lower)) {
    return {
      resolved: true,
      note: `You currently have ${employee.pto_balance.toFixed(1)} PTO days available (${employee.pto_used_ytd.toFixed(1)} used year-to-date). You can submit a new PTO request from the Wellbeing or My Dashboard tab.`,
    };
  }

  if (lower.includes('direct deposit') || (lower.includes('payroll') && lower.includes('when'))) {
    return {
      resolved: true,
      note: 'Direct deposit runs on a biweekly schedule and funds typically post by 9am on payday. To update your bank details, go to Payroll Settings — changes submitted before Wednesday apply to the next cycle.',
    };
  }

  if (lower.includes('401k') || lower.includes('401(k)') || lower.includes('retirement match')) {
    return {
      resolved: true,
      note: 'The company matches 100% of your 401(k) contributions up to 4% of salary, with immediate vesting. You can adjust your contribution rate anytime through the benefits portal.',
    };
  }

  if (lower.includes('benefits') && (lower.includes('enroll') || lower.includes('when') || lower.includes('window'))) {
    return {
      resolved: true,
      note: 'Open enrollment runs each year in November for coverage starting January 1st. Qualifying life events (marriage, birth, relocation) open a 30-day special enrollment window any time.',
    };
  }

  return { resolved: false };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}
