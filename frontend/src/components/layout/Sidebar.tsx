import {
  LayoutDashboard, Users, LineChart, CalendarClock, Building2, Ticket, Bot, LogOut,
  Gauge, Search, UserPlus, Languages, Users2, HeartHandshake, ClipboardList,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useLocaleStore } from '@/store/localeStore';
import { useT } from '@/lib/i18n';
import { cn, initials } from '@/lib/utils';
import type { AppRole } from '@/types';

export type ViewKey =
  | 'dashboard'
  | 'employees'
  | 'flight-risk'
  | 'analytics'
  | 'talent-marketplace'
  | 'twin-employees'
  | 'attendance'
  | 'daily-log'
  | 'departments'
  | 'onboarding'
  | 'tickets'
  | 'agent'
  | 'wellbeing';

interface NavItem {
  key: ViewKey;
  labelKey: string;
  icon: typeof LayoutDashboard;
  roles: AppRole[];
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'employee'] },
  { key: 'employees', labelKey: 'nav.employees', icon: Users, roles: ['admin', 'manager'] },
  { key: 'flight-risk', labelKey: 'nav.flightRisk', icon: Gauge, roles: ['admin', 'manager'] },
  { key: 'analytics', labelKey: 'nav.analytics', icon: LineChart, roles: ['admin', 'manager'] },
  { key: 'talent-marketplace', labelKey: 'nav.talentMarketplace', icon: Search, roles: ['admin', 'manager'] },
  { key: 'twin-employees', labelKey: 'nav.twinEmployees', icon: Users2, roles: ['admin', 'manager'] },
  { key: 'attendance', labelKey: 'nav.attendance', icon: CalendarClock, roles: ['admin', 'manager', 'employee'] },
  { key: 'daily-log', labelKey: 'nav.dailyLog', icon: ClipboardList, roles: ['admin', 'manager', 'employee'] },
  { key: 'departments', labelKey: 'nav.departments', icon: Building2, roles: ['admin', 'manager'] },
  { key: 'onboarding', labelKey: 'nav.onboarding', icon: UserPlus, roles: ['admin', 'manager'] },
  { key: 'tickets', labelKey: 'nav.tickets', icon: Ticket, roles: ['admin', 'manager', 'employee'] },
  { key: 'wellbeing', labelKey: 'nav.wellbeing', icon: HeartHandshake, roles: ['admin', 'manager', 'employee'] },
  { key: 'agent', labelKey: 'nav.agent', icon: Bot, roles: ['admin', 'manager', 'employee'] },
];

interface SidebarProps {
  active: ViewKey;
  onNavigate: (key: ViewKey) => void;
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  const { profile, signOut } = useAuthStore();
  const { locale, setLocale } = useLocaleStore();
  const t = useT();
  const role = profile?.role ?? 'employee';
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">HR</div>
        <div>
          <div className="font-display text-base leading-tight text-slate-800">{t('signIn.brand')}</div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            {role === 'employee' ? t('nav.employeePortal') : t('nav.adminConsole')}
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              <Icon size={17} strokeWidth={2} />
              {t(item.labelKey)}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 px-3 py-2.5">
        <div className="flex items-center gap-1.5 px-2 text-slate-400" title={t('nav.language')}>
          <Languages size={14} />
          <div className="flex overflow-hidden rounded-md border border-slate-200 text-[11px] font-medium">
            {(['en', 'fr'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={cn(
                  'px-2 py-1 uppercase transition-colors',
                  locale === l ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
            {initials(profile?.full_name ?? '?')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-700">{profile?.full_name}</div>
            <div className="truncate text-xs capitalize text-slate-400">{role}</div>
          </div>
          <button onClick={() => signOut()} title={t('nav.signOut')} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
