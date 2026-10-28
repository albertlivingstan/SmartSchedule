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
    try {
      const errJson = await response.json();
      if (errJson && errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
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

  // System
  seedDemoData: (force = true) => request<any>(`/api/system/seed-demo?force=${force}`, { method: 'POST' })
};
