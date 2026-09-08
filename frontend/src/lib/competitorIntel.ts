/**
 * Client-side "competitive intelligence" briefing generator for the dashboard.
 * There is no real news feed wired up (no API key / scraper / backend route) —
 * this synthesizes plausible-looking headlines from templates + placeholder
 * competitor names, the same "clearly simulated" approach as the onboarding
 * event stream and the HR co-pilot's canned confirmations. Swap this for a
 * real news/enrichment API (and a real tracked-competitor list) if one is
 * ever wired up server-side.
 */

export type CompetitorImpact = 'opportunity' | 'watch' | 'threat';

export type CompetitorCategory =
  | 'client_win'
  | 'hiring'
  | 'layoffs'
  | 'leadership'
  | 'expansion'
  | 'practice_launch'
  | 'award'
  | 'partnership';

export interface CompetitorNewsItem {
  id: string;
  company: string;
  category: CompetitorCategory;
  impact: CompetitorImpact;
  headline: string;
  summary: string;
  source: string;
  published_at: string;
}

const COMPANIES = [
  'Meridian Strategy Group',
  'Northlight Consulting',
  'Vantage Point Partners',
  'Cobalt Advisory',
  'Ashford & Reyes',
  'Pinnacle Sigma Consulting',
  'Bluepeak Solutions',
  'Halcyon Partners',
];

const CITIES = ['Austin', 'Toronto', 'Singapore', 'London', 'Denver', 'Dublin', 'Dubai', 'Warsaw'];
const PRACTICES = [
  'change management',
  'HR technology advisory',
  'workforce analytics',
  'digital transformation',
  'M&A integration',
  'ESG advisory',
  'organizational design',
  'AI strategy',
];
const INDUSTRIES = ['financial services', 'healthcare', 'manufacturing', 'retail', 'the public sector', 'technology'];
const ROLES = ['Managing Partner', 'Chief Growth Officer', 'Head of People Analytics', 'Regional Director'];
const PUBLICATIONS = ['Consulting Magazine', 'Forrester Wave', 'Gartner', 'Vault'];
const PARTNERS = ['a leading HR SaaS platform', 'a global systems integrator', 'a boutique AI startup', 'a Big Four spin-off'];
const CLIENTS = ['a Fortune 500 retailer', 'a national healthcare network', 'a multinational bank', 'a government agency'];
const SOURCES = ['LinkedIn', 'Press release', 'Industry wire', 'Trade journal', 'Crunchbase', 'Glassdoor insights'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface Template {
  category: CompetitorCategory;
  impact: CompetitorImpact;
  build: (company: string) => { headline: string; summary: string };
}

const TEMPLATES: Template[] = [
  {
    category: 'client_win',
    impact: 'threat',
    build: (company) => {
      const client = pick(CLIENTS);
      const years = randomInt(2, 5);
      const practice = pick(PRACTICES);
      return {
        headline: `${company} wins multi-year advisory contract with ${client}`,
        summary: `Reports point to a ${years}-year engagement covering ${practice}, expanding ${company}'s footprint in ${pick(INDUSTRIES)}.`,
      };
    },
  },
  {
    category: 'hiring',
    impact: 'watch',
    build: (company) => {
      const n = randomInt(8, 60);
      const city = pick(CITIES);
      const practice = pick(PRACTICES);
      return {
        headline: `${company} opens ${n} new consultant roles in ${city}`,
        summary: `Job postings suggest an aggressive hiring push in ${practice} — a pool of senior talent we may also be courting.`,
      };
    },
  },
  {
    category: 'layoffs',
    impact: 'opportunity',
    build: (company) => {
      const pct = randomInt(4, 18);
      const practice = pick(PRACTICES);
      return {
        headline: `${company} reduces headcount by ${pct}% amid restructuring`,
        summary: `The cuts reportedly concentrated in ${practice}, potentially freeing up experienced talent open to new opportunities.`,
      };
    },
  },
  {
    category: 'leadership',
    impact: 'watch',
    build: (company) => {
      const role = pick(ROLES);
      const practice = pick(PRACTICES);
      return {
        headline: `${company} appoints new ${role} to lead ${practice}`,
        summary: `The hire signals renewed investment in ${practice}, an area where ${company} has historically lagged behind peers.`,
      };
    },
  },
  {
    category: 'expansion',
    impact: 'threat',
    build: (company) => {
      const city = pick(CITIES);
      return {
        headline: `${company} opens a new office in ${city}`,
        summary: `The expansion puts ${company} closer to clients we currently serve remotely from that region.`,
      };
    },
  },
  {
    category: 'practice_launch',
    impact: 'threat',
    build: (company) => {
      const practice = pick(PRACTICES);
      return {
        headline: `${company} launches a new ${practice} practice`,
        summary: `The move follows rising client demand for ${practice} services — worth monitoring for RFP overlap.`,
      };
    },
  },
  {
    category: 'award',
    impact: 'watch',
    build: (company) => {
      const publication = pick(PUBLICATIONS);
      return {
        headline: `${company} named a leader in ${pick(INDUSTRIES)} advisory by ${publication}`,
        summary: `The recognition may strengthen ${company}'s positioning in upcoming procurement cycles.`,
      };
    },
  },
  {
    category: 'partnership',
    impact: 'watch',
    build: (company) => {
      const partner = pick(PARTNERS);
      return {
        headline: `${company} forms a strategic alliance with ${partner}`,
        summary: `The partnership could broaden ${company}'s service bundle and technology delivery capabilities.`,
      };
    },
  },
];

export function generateCompetitorBriefing(count = 6): CompetitorNewsItem[] {
  const shuffledCompanies = [...COMPANIES].sort(() => Math.random() - 0.5);
  const shuffledTemplates = [...TEMPLATES].sort(() => Math.random() - 0.5);

  const items: CompetitorNewsItem[] = [];
  for (let i = 0; i < count; i++) {
    const company = shuffledCompanies[i % shuffledCompanies.length]!;
    const template = shuffledTemplates[i % shuffledTemplates.length]!;
    const { headline, summary } = template.build(company);
    const publishedAt = new Date(Date.now() - randomInt(1, 240) * 3600 * 1000).toISOString();
    items.push({
      id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      company,
      category: template.category,
      impact: template.impact,
      headline,
      summary,
      source: pick(SOURCES),
      published_at: publishedAt,
    });
  }

  return items.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
}
