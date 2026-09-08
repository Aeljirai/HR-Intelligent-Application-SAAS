import { useEffect, useState, type ComponentType } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Sidebar, type ViewKey } from '@/components/layout/Sidebar';
import { HrCoPilot } from '@/components/HrCoPilot';
import { SignInView } from '@/views/auth/SignInView';
import { DashboardView } from '@/views/DashboardView';
import { EmployeesView } from '@/views/EmployeesView';
import { FlightRiskSimulatorView } from '@/views/FlightRiskSimulatorView';
import { AnalyticsView } from '@/views/AnalyticsView';
import { TalentMarketplaceView } from '@/views/TalentMarketplaceView';
import { TwinEmployeesView } from '@/views/TwinEmployeesView';
import { AttendanceView } from '@/views/AttendanceView';
import { DailyWorkLogView } from '@/views/DailyWorkLogView';
import { DepartmentsView } from '@/views/DepartmentsView';
import { OnboardingTrackerView } from '@/views/OnboardingTrackerView';
import { TicketsView } from '@/views/TicketsView';
import { AgentView } from '@/views/AgentView';
import { WellbeingView } from '@/views/WellbeingView';

const VIEW_COMPONENTS: Record<ViewKey, ComponentType> = {
  dashboard: DashboardView,
  employees: EmployeesView,
  'flight-risk': FlightRiskSimulatorView,
  analytics: AnalyticsView,
  'talent-marketplace': TalentMarketplaceView,
  'twin-employees': TwinEmployeesView,
  attendance: AttendanceView,
  'daily-log': DailyWorkLogView,
  departments: DepartmentsView,
  onboarding: OnboardingTrackerView,
  tickets: TicketsView,
  agent: AgentView,
  wellbeing: WellbeingView,
};

export default function App() {
  const { status, profile, init } = useAuthStore();
  const [activeView, setActiveView] = useState<ViewKey>('dashboard');

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  if (status === 'signed_out' || !profile) {
    return <SignInView />;
  }

  const ActiveComponent = VIEW_COMPONENTS[activeView];

  return (
    <div className="flex">
      <Sidebar active={activeView} onNavigate={setActiveView} />
      <ActiveComponent />
      <HrCoPilot />
    </div>
  );
}
