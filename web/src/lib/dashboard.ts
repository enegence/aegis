import type { DashboardSummary } from '@underwing/shared';
import { apiFetch } from './api.js';

export async function getDashboard(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>('/api/dashboard');
}
