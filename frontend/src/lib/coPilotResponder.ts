import type { AppRole, Employee } from '@/types';
import { formatCurrency } from '@/lib/utils';

/**
 * Rule-based fast path for the floating HR Co-Pilot. Deliberately simple
 * (same keyword-pattern approach as the Tier-0 ticket auto-resolution in
 * lib/ml/sentiment.ts) for the handful of facts already loaded into the app
 * (PTO balance, company headcount) or fixed personalized answers — instant,
 * no network round-trip. Returns an i18n key (not literal text) so the UI
 * can render it in whichever language the app is currently set to.
 *
 * Anything that doesn't match falls through with `needsRag: true` — the
 * same shape as attemptTier0Resolution's `{resolved: false}` in
 * ml-service/src/ml/sentiment.ts escalating an unresolved ticket. Here,
 * HrCoPilot.tsx uses that signal to escalate to the real RAG-grounded
 * policy copilot (POST /api/policy-copilot/ask) instead of a human queue.
 */

export type CoPilotActionKind = 'draft_request' | 'view_leave_policy' | 'download_tax_doc';

export interface CoPilotAction {
  labelKey: string;
  kind: CoPilotActionKind;
}

export interface CoPilotReply {
  key: string;
  params?: Record<string, string | number>;
  actions?: CoPilotAction[];
  needsRag?: boolean;
}

export interface CoPilotContext {
  employee: Employee | null;
  role: AppRole;
  summary: { headcount: number; departments: number; avg_performance: number } | null;
}

const ACTION_DRAFT: CoPilotAction = { labelKey: 'coPilot.draftRequest', kind: 'draft_request' };
const ACTION_LEAVE_POLICY: CoPilotAction = { labelKey: 'coPilot.viewLeavePolicy', kind: 'view_leave_policy' };
const ACTION_DOWNLOAD_W2: CoPilotAction = { labelKey: 'coPilot.downloadW2', kind: 'download_tax_doc' };

// ---------------------------------------------------------------------
// Privacy guard — mirrors backend/.../service/NlCommandService.java's
// applyPrivacyGuard exactly (same patterns, same decision order), since the
// co-pilot answers locally without a round-trip. An employee may ask about
// their own salary/performance/attendance/personal info; asking about
// anyone else's is refused outright, before falling through to RAG.
// ---------------------------------------------------------------------
const SALARY_TOPIC = /\b(salary|salaries|wage|wages|compensation)\b|how much (does|do|is)\b.*\b(make|makes|earn|earns|earning|get paid|paid)\b/i;
const PERFORMANCE_TOPIC = /\bperformance\s?(score|rating|review)?\b/i;
const ATTENDANCE_TOPIC = /\battendance\b/i;
const PERSONAL_INFO_TOPIC = /\bpersonal (info|information|details)\b|\b(home address|phone number|date of birth|social security|ssn|pto balance|leave balance|vacation balance)\b/i;
const AGGREGATE_EXCEPTION = /\b(average|median|range|company-wide|companywide|overall|typical|total payroll|compensation gap)\b/i;
const SELF_REFERENCE = /\b(my|i|me|mine)\b/i;
const THIRD_PARTY_HINT = /\b(he|she|him|her|his|hers|they|them|their|someone else|another employee|other employee|coworker|colleague|manager|boss|supervisor|director|teammate|direct report)\b/i;
/** Case-sensitive, and requires a preceding space (not just a word boundary) so a sentence-initial capital — "What's my salary?" — is never mistaken for a person's name. */
const NAMED_OTHER = /(?<=\s)[A-Z][a-zA-Z'-]{1,30}(?:'s\b|\s+(?:make|makes|earn|earns|earning|get paid|is paid))/;

function isPrivateTopic(text: string): boolean {
  return SALARY_TOPIC.test(text) || PERFORMANCE_TOPIC.test(text) || ATTENDANCE_TOPIC.test(text) || PERSONAL_INFO_TOPIC.test(text);
}

function buildSelfAnswer(query: string, employee: Employee): CoPilotReply {
  if (SALARY_TOPIC.test(query)) {
    return { key: 'coPilot.selfSalaryAnswer', params: { salary: formatCurrency(employee.salary) } };
  }
  if (PERFORMANCE_TOPIC.test(query)) {
    return { key: 'coPilot.selfPerformanceAnswer', params: { score: employee.performance_score.toFixed(0) } };
  }
  if (ATTENDANCE_TOPIC.test(query)) {
    return { key: 'coPilot.selfAttendanceAnswer' };
  }
  return { key: 'coPilot.selfProfileAnswer', params: { title: employee.job_title, seniority: employee.seniority } };
}

/** Returns null when the query isn't privacy-relevant, so normal handling (including RAG) proceeds untouched. */
function applyPrivacyGuard(query: string, ctx: CoPilotContext): CoPilotReply | null {
  if (AGGREGATE_EXCEPTION.test(query)) return null;
  if (!isPrivateTopic(query)) return null;

  const mentionsOther = THIRD_PARTY_HINT.test(query) || NAMED_OTHER.test(query);
  if (mentionsOther) return { key: 'coPilot.privacyBlocked' };

  const selfPhrased = SELF_REFERENCE.test(query);
  if (!selfPhrased) return { key: 'coPilot.privacyBlocked' };

  if (!ctx.employee) return { key: 'coPilot.noEmployeeRecord' };
  return buildSelfAnswer(query, ctx.employee);
}

export function answerCoPilotQuery(query: string, ctx: CoPilotContext): CoPilotReply {
  const lower = query.toLowerCase();

  const guarded = applyPrivacyGuard(query, ctx);
  if (guarded) return guarded;

  if (ctx.employee && (/(pto|vacation|time off).*(balance|left|remaining)/.test(lower) || /(how many).*(pto|vacation)/.test(lower))) {
    return {
      key: 'coPilot.ptoAnswer',
      params: { balance: ctx.employee.pto_balance.toFixed(1), used: ctx.employee.pto_used_ytd.toFixed(1) },
      actions: [ACTION_DRAFT, ACTION_LEAVE_POLICY],
    };
  }

  if (/401\s?\(?k\)?|retirement match/.test(lower)) {
    return { key: 'coPilot.retirementAnswer' };
  }

  if (lower.includes('benefit')) {
    return { key: 'coPilot.benefitsAnswer', actions: [ACTION_LEAVE_POLICY] };
  }

  if (lower.includes('direct deposit') || (lower.includes('payroll') && lower.includes('when'))) {
    return { key: 'coPilot.directDepositAnswer' };
  }

  if (/w-?2|tax (form|document)/.test(lower)) {
    return { key: 'coPilot.taxDocAnswer', actions: [ACTION_DOWNLOAD_W2] };
  }

  if (ctx.role !== 'employee' && ctx.summary && /(how many employees|headcount|company size)/.test(lower)) {
    return { key: 'coPilot.headcountAnswer', params: { headcount: ctx.summary.headcount, departments: ctx.summary.departments } };
  }

  if (ctx.role !== 'employee' && ctx.summary && /performance/.test(lower)) {
    return { key: 'coPilot.performanceAnswer', params: { score: ctx.summary.avg_performance.toFixed(0) } };
  }

  return { key: 'coPilot.fallback', params: { extraKey: ctx.role !== 'employee' ? 'coPilot.fallbackExtra' : '' }, needsRag: true };
}

export function coPilotActionKey(kind: CoPilotActionKind): string {
  switch (kind) {
    case 'draft_request':
      return 'coPilot.draftRequestConfirm';
    case 'view_leave_policy':
      return 'coPilot.viewLeavePolicyConfirm';
    case 'download_tax_doc':
      return 'coPilot.downloadW2Confirm';
  }
}
