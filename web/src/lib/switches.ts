import type { Switch, SwitchReadiness } from '@aegis/shared';
import { apiFetch, csrfFetch } from './api.js';

export async function listSwitches(): Promise<Switch[]> {
  return apiFetch<Switch[]>('/api/switches');
}

export async function getSwitch(id: number): Promise<Switch> {
  return apiFetch<Switch>(`/api/switches/${id}`);
}

export async function getSwitchReadiness(id: number): Promise<SwitchReadiness> {
  return apiFetch<SwitchReadiness>(`/api/switches/${id}/readiness`);
}

export async function createSwitch(input: Record<string, unknown>): Promise<Switch> {
  return csrfFetch<Switch>('/api/switches', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateSwitch(id: number, input: Record<string, unknown>): Promise<Switch> {
  return csrfFetch<Switch>(`/api/switches/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteSwitch(id: number): Promise<void> {
  return csrfFetch<void>(`/api/switches/${id}`, { method: 'DELETE' });
}

export async function armSwitch(id: number): Promise<Switch> {
  return csrfFetch<Switch>(`/api/switches/${id}/arm`, { method: 'POST', body: JSON.stringify({}) });
}

export async function pauseSwitch(id: number): Promise<Switch> {
  return csrfFetch<Switch>(`/api/switches/${id}/pause`, { method: 'POST', body: JSON.stringify({}) });
}

export async function cancelSwitch(id: number): Promise<Switch> {
  return csrfFetch<Switch>(`/api/switches/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
}

export async function checkInSwitch(id: number): Promise<Switch> {
  return csrfFetch<Switch>(`/api/switches/${id}/check-in`, { method: 'POST', body: JSON.stringify({}) });
}
