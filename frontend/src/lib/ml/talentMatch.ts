import type { Employee, Seniority } from '@/types';

/**
 * Talent Marketplace matching — entirely client-side against employees
 * already in memory (same "duplicated ML" pattern as flightRisk.ts /
 * compensationSandbox.ts): a project staffing search has no persisted
 * state to protect, so there's no reason to round-trip to the server.
 * The skill vocabulary is derived from the live employee dataset rather
 * than a hardcoded list, so it stays correct as skills change.
 */

export interface TalentMatch {
  employee: Employee;
  matchPct: number;
  matchedSkills: string[];
  gapSkills: string[];
  seniorityMatch: boolean;
}

const SENIORITY_RANK: Record<Seniority, number> = { junior: 0, mid: 1, senior: 2, lead: 3, principal: 4 };

const SENIORITY_KEYWORDS: [RegExp, Seniority][] = [
  [/\bprincipal\b/i, 'principal'],
  [/\blead(s|ing)?\b/i, 'lead'],
  [/\bsenior\b|\bsr\.?\b/i, 'senior'],
  [/\bmid[- ]?level\b|\bmid\b/i, 'mid'],
  [/\bjunior\b|\bjr\.?\b|\bentry[- ]?level\b/i, 'junior'],
];

function extractSeniority(query: string): Seniority | null {
  for (const [re, level] of SENIORITY_KEYWORDS) {
    if (re.test(query)) return level;
  }
  return null;
}

function extractSkills(query: string, vocabulary: string[]): string[] {
  const lower = query.toLowerCase();
  return vocabulary.filter((skill) => lower.includes(skill.toLowerCase()));
}

/** Returns the top matches for a free-text staffing request, best match first. */
export function searchTalent(query: string, employees: Employee[]): TalentMatch[] {
  const vocabulary = Array.from(new Set(employees.flatMap((e) => (e.skills ?? []).map((s) => s.skill_name))));
  const requestedSkills = extractSkills(query, vocabulary);
  const requestedSeniority = extractSeniority(query);

  return employees
    .filter((e) => e.status === 'active')
    .map((employee): TalentMatch => {
      const mySkills = new Set((employee.skills ?? []).map((s) => s.skill_name));
      const matchedSkills = requestedSkills.filter((s) => mySkills.has(s));
      const gapSkills = requestedSkills.filter((s) => !mySkills.has(s));

      const skillScore = requestedSkills.length ? (matchedSkills.length / requestedSkills.length) * 80 : 40;

      let seniorityScore = 20;
      let seniorityMatch = true;
      if (requestedSeniority) {
        const diff = SENIORITY_RANK[employee.seniority] - SENIORITY_RANK[requestedSeniority];
        seniorityMatch = diff >= 0;
        seniorityScore = diff === 0 ? 20 : diff > 0 ? 14 : diff === -1 ? 8 : 0;
      }

      const matchPct = Math.round(Math.min(100, skillScore + seniorityScore));
      return { employee, matchPct, matchedSkills, gapSkills, seniorityMatch };
    })
    .filter((r) => requestedSkills.length === 0 || r.matchedSkills.length > 0)
    .sort((a, b) => b.matchPct - a.matchPct)
    .slice(0, 12);
}
