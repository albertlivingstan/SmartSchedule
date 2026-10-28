export interface Appointment {
  id: number;
  client: string;
  email: string;
  service: string;
  staff: string;
  starts_at: string;
  ends_at: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'recovered';
  notes: string;
  created_at: string;
  updated_at: string;
  source: string;
  external_id?: string;
  risk_score: number;
  risk_tier: 'Low' | 'Medium' | 'High';
  risk_factors: string[];
  slot_score: number;
}

export interface WaitingListEntry {
  id: number;
  client: string;
  email: string;
  service: string;
  staff_preference: string;
  preferred_start: string;
  preferred_end: string;
  urgency_score: number;
  status: 'waiting' | 'offered' | 'matched' | 'cancelled';
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface SlotOffer {
  id: number;
  waiting_list_id: number;
  cancelled_appointment_id: number;
  offered_start: string;
  offered_end: string;
  staff: string;
  service: string;
  expires_at: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  idempotency_key: string;
  created_at: string;
  responded_at?: string;
}

export interface StatsResponse {
  total: number;
  statuses: {
    scheduled: number;
    completed: number;
    cancelled: number;
    no_show: number;
  };
  services: Record<string, number>;
  days: { date: string; count: number }[];
  reminders: Record<string, number>;
  recovered_slots: number;
  recovery_rate: number;
  waiting_list_count: number;
  executions_count: number;
}

export interface NotificationItem {
  id: number;
  recipient_email: string;
  recipient_name: string;
  notification_type: string;
  subject: string;
  payload: Record<string, any>;
  status: string;
  retry_count: number;
  max_retries: number;
  idempotency_key: string;
  last_error?: string;
  scheduled_for: string;
  created_at: string;
  processed_at?: string;
}

export interface AutomationExecution {
  id: number;
  execution_id: string;
  workflow_name: string;
  uipath_job_id?: string;
  appointment_id?: number;
  event_type: string;
  started_at: string;
  completed_at?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying' | 'queued_local';
  retry_count: number;
  payload: Record<string, any>;
  error_message?: string;
  correlation_id?: string;
}

export interface RecommendedSlot {
  starts_at: string;
  ends_at: string;
  staff: string;
  service: string;
  score: number;
  breakdown: {
    preference_proximity: number;
    workload_balance: number;
    buffer_efficiency: number;
  };
  reason: string;
}

export interface ResearchResults {
  experiment_timestamp: string;
  sample_size: number;
  seed: number;
  approaches: {
    manual_baseline: {
      label: string;
      conflict_prevention_rate: number;
      slot_recovery_rate: number;
      average_processing_time_sec: number;
      slot_utilization_percent: number;
      automation_success_rate: number;
      total_duration_hours: number;
    };
    rule_based: {
      label: string;
      conflict_prevention_rate: number;
      slot_recovery_rate: number;
      average_processing_time_sec: number;
      slot_utilization_percent: number;
      automation_success_rate: number;
      total_duration_hours: number;
    };
    smartschedule_ai: {
      label: string;
      conflict_prevention_rate: number;
      slot_recovery_rate: number;
      average_processing_time_ms: number;
      slot_utilization_percent: number;
      automation_success_rate: number;
      time_saved_hours: number;
      ai_prediction_accuracy: number;
      ai_precision: number;
      ai_recall: number;
      ai_f1_score: number;
      ai_roc_auc: number;
    };
  };
  research_findings: string[];
}
