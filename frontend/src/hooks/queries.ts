import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import type {
  AgentCommand,
  AgentResult,
  AttendanceAnomaly,
  AttendanceRecord,
  CompensationSandboxResult,
  CreateDailyWorkLogPayload,
  DailyWorkLog,
  Department,
  DepartmentHeatmapEntry,
  DepartmentLoad,
  Employee,
  FlightRiskCounterfactuals,
  GeoSummary,
  HeadcountPoint,
  OnaGraph,
  Project,
  ReallocationSuggestion,
  ShiftPlan,
  Ticket,
  TicketCategory,
  TicketUrgency,
  TwinEmployeesResult,
  WellbeingClub,
  WellbeingRequest,
  WellbeingRequestStatus,
  WellbeingRequestType,
} from '@/types';

// ---- Dashboard ----------------------------------------------------------
export function useDashboardSummary(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.get<{ headcount: number; departments: number; avg_performance: number; avg_tenure_years: number; open_positions_estimate: number }>('/dashboard/summary'),
    enabled,
  });
}
export function useAttendanceAnomalies() {
  return useQuery({ queryKey: ['dashboard', 'anomalies'], queryFn: () => api.get<AttendanceAnomaly[]>('/dashboard/anomalies') });
}
export function useHeadcountForecast(months = 6) {
  return useQuery({
    queryKey: ['dashboard', 'forecast', months],
    queryFn: () => api.get<HeadcountPoint[]>(`/dashboard/headcount-forecast?months=${months}`),
  });
}

// ---- Employees ------------------------------------------------------------
export function useEmployees(enabled = true) {
  return useQuery({ queryKey: ['employees'], queryFn: () => api.get<Employee[]>('/employees'), enabled });
}
export function useMyEmployee(enabled = true) {
  return useQuery({ queryKey: ['employees', 'me'], queryFn: () => api.get<Employee>('/employees/me'), enabled });
}
export function useFlightRiskSimulation(employeeId: string | null) {
  return useMutation({
    mutationFn: (overrides: { overtimeHoursMonth?: number; daysSinceVacation?: number; salary?: number }) =>
      api.post(`/employees/${employeeId}/flight-risk-simulate`, overrides),
  });
}
export function useFlightRiskCounterfactuals() {
  return useMutation({
    mutationFn: (employeeId: string) => api.get<FlightRiskCounterfactuals>(`/employees/${employeeId}/flight-risk-counterfactuals`),
  });
}

// ---- Departments ------------------------------------------------------------
export function useDepartments() {
  return useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/departments') });
}
export function useBudgetHeatmap() {
  return useQuery({ queryKey: ['departments', 'heatmap'], queryFn: () => api.get<DepartmentHeatmapEntry[]>('/departments/budget-heatmap') });
}
export function useReallocation() {
  return useQuery({
    queryKey: ['departments', 'reallocation'],
    queryFn: () => api.get<{ loads: DepartmentLoad[]; suggestions: ReallocationSuggestion[] }>('/departments/reallocation'),
  });
}

// ---- Attendance ------------------------------------------------------------
export function useAttendance(since?: string) {
  return useQuery({
    queryKey: ['attendance', since ?? 'all'],
    queryFn: () => api.get<AttendanceRecord[]>(`/attendance${since ? `?since=${since}` : ''}`),
  });
}
export function useShiftPlan(departmentId: string | null) {
  return useQuery({
    queryKey: ['attendance', 'shift-plan', departmentId],
    queryFn: () => api.get<ShiftPlan>(`/attendance/shift-plan${departmentId ? `?department_id=${departmentId}` : ''}`),
  });
}
export function useGeoSummary() {
  return useQuery({ queryKey: ['attendance', 'geo-summary'], queryFn: () => api.get<GeoSummary[]>('/attendance/geo-summary') });
}

// ---- Tickets ------------------------------------------------------------
export function useTickets() {
  return useQuery({ queryKey: ['tickets'], queryFn: () => api.get<Ticket[]>('/tickets') });
}
export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { subject: string; description: string; category?: TicketCategory; priority?: TicketUrgency }) =>
      api.post('/tickets', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}
export function useUpdateTicketStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, resolution_note }: { id: string; status: Ticket['status']; resolution_note?: string }) =>
      api.patch(`/tickets/${id}/status`, { status, resolution_note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}
export function useAnalyzeTicketPreview() {
  return useMutation({
    mutationFn: (text: string) =>
      api.post<{ sentiment: { label: string; score: number }; urgency: string; category: string; routing: { escalate: boolean; queue: string; reason: string } }>(
        '/tickets/analyze-preview',
        { text }
      ),
  });
}

// ---- Analytics ------------------------------------------------------------
export function useOnaGraph() {
  return useQuery({ queryKey: ['analytics', 'ona-graph'], queryFn: () => api.get<OnaGraph>('/analytics/ona-graph') });
}
export function useCompensationSandbox() {
  return useMutation({
    mutationFn: (adjustment_pct: number) => api.post<CompensationSandboxResult>('/analytics/compensation-sandbox', { adjustment_pct }),
  });
}

// ---- Twin Employees ------------------------------------------------------------
export function useTwinEmployees() {
  return useQuery({ queryKey: ['twin-employees'], queryFn: () => api.get<TwinEmployeesResult>('/twin-employees') });
}

// ---- Wellbeing ------------------------------------------------------------
export function useWellbeingClubs() {
  return useQuery({ queryKey: ['wellbeing', 'clubs'], queryFn: () => api.get<WellbeingClub[]>('/wellbeing/clubs') });
}
export function useWellbeingRequests() {
  return useQuery({ queryKey: ['wellbeing', 'requests'], queryFn: () => api.get<WellbeingRequest[]>('/wellbeing/requests') });
}
export function useCreateWellbeingRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { type: WellbeingRequestType; club_id?: string; note?: string }) =>
      api.post<WellbeingRequest>('/wellbeing/requests', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wellbeing', 'requests'] }),
  });
}
export function useUpdateWellbeingRequestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, scheduled_at, reviewer_note }: { id: string; status: WellbeingRequestStatus; scheduled_at?: string; reviewer_note?: string }) =>
      api.patch<WellbeingRequest>(`/wellbeing/requests/${id}`, { status, scheduled_at, reviewer_note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wellbeing', 'requests'] }),
  });
}

// ---- Policy Co-Pilot (RAG) -------------------------------------------------
export function useAskPolicyCopilot() {
  return useMutation({
    mutationFn: (question: string) =>
      api.post<{ answer: string; sources: { title: string; excerpt: string }[] }>('/policy-copilot/ask', { question }),
  });
}

// ---- Projects ------------------------------------------------------------
export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => api.get<Project[]>('/projects') });
}

// ---- Daily Work Log --------------------------------------------------------
export function useMyDailyWorkLogs() {
  return useQuery({ queryKey: ['daily-work-logs', 'mine'], queryFn: () => api.get<DailyWorkLog[]>('/daily-work-logs/mine') });
}
export function useAllDailyWorkLogs() {
  return useQuery({ queryKey: ['daily-work-logs', 'all'], queryFn: () => api.get<DailyWorkLog[]>('/daily-work-logs') });
}
export function useSubmitDailyWorkLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDailyWorkLogPayload) => api.post<DailyWorkLog>('/daily-work-logs', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-work-logs'] }),
  });
}

// ---- AI Agent ------------------------------------------------------------
export function useAgentCommand() {
  return useMutation({
    mutationFn: (text: string) => api.post<{ command: AgentCommand; result: AgentResult }>('/agent/command', { text }),
  });
}
