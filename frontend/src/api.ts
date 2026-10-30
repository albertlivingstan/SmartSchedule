import {
  Appointment, WaitingListEntry, SlotOffer, StatsResponse,
  NotificationItem, AutomationExecution, RecommendedSlot, ResearchResults
} from './types';

const API_BASE = '';

export function getApiKey(): string {
  return sessionStorage.getItem('ss_key') || localStorage.getItem('ss_key') || 'local-demo-key';
}

export function setApiKey(key: string) {
  sessionStorage.setItem('ss_key', key);
  localStorage.setItem('ss_key', key);
}

export function getAuthToken(): string | null {
  return sessionStorage.getItem('ss_token') || localStorage.getItem('ss_token');
}

export function setAuthToken(token: string | null) {
  if (token) {
    sessionStorage.setItem('ss_token', token);
    localStorage.setItem('ss_token', token);
  } else {
    sessionStorage.removeItem('ss_token');
    localStorage.removeItem('ss_token');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': getApiKey(),
    ...(options.headers as Record<string, string> || {})
  };

  const token = getAuthToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}: ${response.statusText}`;
    let parsedData: any = null;
    try {
      parsedData = await response.json();
      if (parsedData && parsedData.detail) {
        if (typeof parsedData.detail === 'string') {
          errorDetail = parsedData.detail;
        } else if (parsedData.detail.detail) {
          errorDetail = parsedData.detail.detail;
        } else {
          errorDetail = JSON.stringify(parsedData.detail);
        }
      }
    } catch {
      // ignore
    }
    const err: any = new Error(errorDetail);
    err.status = response.status;
    err.data = parsedData;
    throw err;
  }

  // Handle CSV or non-JSON
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('text/csv')) {
    return response.text() as unknown as T;
  }

  return response.json();
}

export const api = {
  // Stats & Overview
  getStats: () => request<StatsResponse>('/api/stats'),
  getHealth: () => request<{ status: string; service: string; version: string; ai_model: string; uipath_integration: string }>('/health'),

  // Appointments
  getAppointments: (status?: string, q?: string) => {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.append('status', status);
    if (q) params.append('q', q);
    params.append('limit', '500');
    return request<Appointment[]>(`/api/appointments?${params.toString()}`);
  },
  createAppointment: (payload: { client: string; email: string; service: string; staff: string; starts_at: string; duration_minutes: number; notes?: string }) =>
    request<{ appointment: Appointment; duplicate: boolean }>('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateAppointmentStatus: (id: number, status: 'scheduled' | 'completed' | 'cancelled' | 'no_show') =>
    request<Appointment>(`/api/appointments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }),
  getAudit: (id: number) => request<any[]>(`/api/appointments/${id}/audit`),

  // Scheduling Recommendations
  recommendSlots: (payload: { service_name: string; staff_preference?: string; target_date?: string; preferred_time?: string }) =>
    request<{ service: string; staff_preference: string; total_available_slots: number; recommended_slots: RecommendedSlot[] }>(
      '/api/scheduling/recommend-slots',
      { method: 'POST', body: JSON.stringify(payload) }
    ),
  getStaff: () => request<any[]>('/api/scheduling/staff'),
  getServices: () => request<any[]>('/api/scheduling/services'),

  // Waiting List & Cancellation Recovery
  getWaitingList: (status?: string) => request<WaitingListEntry[]>(`/api/waiting-list${status ? `?status=${status}` : ''}`),
  addToWaitingList: (payload: any) => request<WaitingListEntry>('/api/waiting-list', { method: 'POST', body: JSON.stringify(payload) }),
  cancelWaitingList: (id: number) => request<{ message: string }>(`/api/waiting-list/${id}`, { method: 'DELETE' }),
  getSlotOffers: () => request<SlotOffer[]>('/api/recovery/offers'),
  acceptOffer: (id: number) => request<{ success: boolean; detail: string; appointment: Appointment }>(`/api/recovery/offers/${id}/accept`, { method: 'POST' }),
  declineOffer: (id: number) => request<{ success: boolean; detail: string }>(`/api/recovery/offers/${id}/decline`, { method: 'POST' }),
  triggerRecovery: (apptId: number) => request<any>(`/api/recovery/trigger/${apptId}`, { method: 'POST' }),

  // AI & ML
  predictNoShow: (params: Record<string, any>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) sp.append(k, String(v));
    return request<any>(`/api/ai/predict-no-show?${sp.toString()}`, { method: 'POST' });
  },
  getModelInfo: () => request<any>('/api/ai/model-info'),
  retrainModel: (modelType: string) => request<any>(`/api/ai/retrain?model_type=${encodeURIComponent(modelType)}`, { method: 'POST' }),

  // Automation & UiPath
  getExecutions: () => request<AutomationExecution[]>('/api/integrations/executions'),
  getUiPathHealth: () => request<any>('/api/integrations/uipath/health'),
  getPendingTasks: () => request<any>('/api/integrations/uipath/pending-tasks'),

  // Notifications
  getOutbox: () => request<NotificationItem[]>('/api/notifications/outbox'),
  processOutboxTick: () => request<{ message: string; counts: { outbox: number; reminders: number } }>('/api/notifications/process-tick', { method: 'POST' }),
  getNotificationStatus: () => request<any>('/api/notifications/status'),

  // Research Evaluation
  runExperiment: (sampleSize = 100, seed = 42) => request<ResearchResults>('/api/research/run-experiment', {
    method: 'POST',
    body: JSON.stringify({ sample_size: sampleSize, seed })
  }),
  getLatestResearch: () => request<ResearchResults>('/api/research/latest'),

  // Conflict Resolution & Concurrency Approvals
  getSlotAvailability: (service: string, staff = 'Any', date?: string) => {
    const sp = new URLSearchParams({ service, staff });
    if (date) sp.append('date', date);
    return request<any[]>(`/api/appointments/availability?${sp.toString()}`);
  },
  getSlotAlternatives: (staff: string, service: string, starts_at: string, duration_minutes = 30) => {
    const sp = new URLSearchParams({ staff, service, starts_at, duration_minutes: String(duration_minutes) });
    return request<any[]>(`/api/appointments/alternatives?${sp.toString()}`);
  },
  submitRescheduling: (payload: {
    conflict_id?: string;
    client_name: string;
    client_email: string;
    service: string;
    staff: string;
    requested_starts_at: string;
    original_starts_at?: string;
    duration_minutes?: number;
    user_consent: boolean;
    notes?: string;
    original_appointment_id?: number;
  }) => request<any>('/api/rescheduling/request', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  approveRescheduling: (requestId: string, payload?: { approver_id?: string; approver_notes?: string }) =>
    request<any>(`/api/rescheduling/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload || {})
    }),
  rejectRescheduling: (requestId: string, payload?: { approver_id?: string; rejection_reason?: string }) =>
    request<any>(`/api/rescheduling/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify(payload || {})
    }),
  getReschedulingStatus: (requestId: string) => request<any>(`/api/rescheduling/${requestId}/status`),
  getBookingConflicts: (status?: string, q?: string) => {
    const sp = new URLSearchParams();
    if (status && status !== 'all') sp.append('status', status);
    if (q) sp.append('q', q);
    return request<{ conflicts: any[]; rescheduling_requests: any[]; audit_logs: any[] }>(`/api/admin/booking-conflicts?${sp.toString()}`);
  },
  getConflictStats: () => request<any>('/api/conflicts/stats'),

  // System
  seedDemoData: (force = true) => request<any>(`/api/system/seed-demo?force=${force}`, { method: 'POST' })
};
