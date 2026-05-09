import type { DashboardSummary } from '@aegis/shared';
import { apiFetch } from './api.js';

export async function getDashboard(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>('/api/dashboard');
}
