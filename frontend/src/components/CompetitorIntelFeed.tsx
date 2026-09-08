import { useState } from 'react';
import {
  Award,
  Building2,
  Handshake,
  Newspaper,
  RefreshCw,
  Sparkles,
  TrendingDown,
  UserPlus,
  UserCog,
  Trophy,
} from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Feedback';
import { cn, initials, timeAgo } from '@/lib/utils';
import { generateCompetitorBriefing, type CompetitorCategory, type CompetitorImpact, type CompetitorNewsItem } from '@/lib/competitorIntel';

const IMPACT_TONE: Record<CompetitorImpact, BadgeTone> = {
  opportunity: 'green',
  watch: 'amber',
  threat: 'rose',
};

const CATEGORY_ICON: Record<CompetitorCategory, typeof Newspaper> = {
  client_win: Trophy,
  hiring: UserPlus,
  layoffs: TrendingDown,
  leadership: UserCog,
  expansion: Building2,
  practice_launch: Sparkles,
  award: Award,
  partnership: Handshake,
};

const AVATAR_TONES = [
  'bg-blue-50 text-blue-700',
  'bg-violet-50 text-violet-700',
  'bg-emerald-50 text-emerald-700',
  'bg-amber-50 text-amber-700',
  'bg-rose-50 text-rose-700',
  'bg-slate-100 text-slate-700',
];

function avatarTone(company: string): string {
  let hash = 0;
  for (let i = 0; i < company.length; i++) hash = (hash * 31 + company.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

export function CompetitorIntelFeed() {
  const t = useT();
  const [items, setItems] = useState<CompetitorNewsItem[]>(() => generateCompetitorBriefing());
  const [generating, setGenerating] = useState(false);

  function regenerate() {
    if (generating) return;
    setGenerating(true);
    setTimeout(() => {
      setItems(generateCompetitorBriefing());
      setGenerating(false);
    }, 700);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Newspaper size={16} className="text-slate-400" />
          <div>
            <CardTitle>{t('competitorIntel.title')}</CardTitle>
            <p className="text-xs text-slate-400">{t('competitorIntel.subtitle')}</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={regenerate} disabled={generating}>
          <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
          {generating ? t('competitorIntel.generating') : t('competitorIntel.generate')}
        </Button>
      </CardHeader>
      <CardBody>
        {!items.length ? (
          <EmptyState title={t('competitorIntel.noItems')} description={t('competitorIntel.noItemsDesc')} />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {items.map((item) => {
              const Icon = CATEGORY_ICON[item.category];
              return (
                <div
                  key={item.id}
                  className={cn(
                    'rounded-lg border border-slate-100 p-3.5 transition-colors hover:border-slate-200',
                    generating && 'opacity-50'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                          avatarTone(item.company)
                        )}
                      >
                        {initials(item.company)}
                      </span>
                      <span className="truncate text-xs font-medium text-slate-600">{item.company}</span>
                    </div>
                    <Badge tone={IMPACT_TONE[item.impact]}>{t(`competitorIntel.impact.${item.impact}`)}</Badge>
                  </div>

                  <p className="mt-2.5 text-sm font-medium leading-snug text-slate-800">{item.headline}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.summary}</p>

                  <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Icon size={12} />
                    <span>{t(`competitorIntel.category.${item.category}`)}</span>
                    <span aria-hidden>·</span>
                    <span>{item.source}</span>
                    <span aria-hidden>·</span>
                    <span>{timeAgo(item.published_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-[11px] italic text-slate-300">{t('competitorIntel.disclaimer')}</p>
      </CardBody>
    </Card>
  );
}
