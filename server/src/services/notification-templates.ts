export interface TemplateData {
  ownerName?: string;
  switchName?: string;
  mode?: string;
  nextActionAt?: string;
}

export type TemplatePurpose =
  | 'owner_test_notification'
  | 'owner_trip_reminder'
  | 'owner_heartbeat_reminder'
  | 'owner_warning_started'
  | 'owner_trigger_reached_local_only';

export function renderTemplate(
  purpose: TemplatePurpose,
  data: TemplateData,
): { subject: string; body: string } {
  const switchName = data.switchName ?? 'your switch';
  const nextActionAt = data.nextActionAt ?? '(unknown)';
  const mode = data.mode ?? 'heartbeat';

  switch (purpose) {
    case 'owner_test_notification':
      return {
        subject: 'Aegis: Test notification',
        body: `This is a test notification from Aegis for switch '${switchName}'. Your notification channel is working correctly.`,
      };

    case 'owner_trip_reminder':
      return {
        subject: `Aegis: Trip check-in reminder for '${switchName}'`,
        body: `Reminder: Your '${switchName}' switch (${mode} mode) requires check-in by ${nextActionAt}. Please log in and check in to reset the timer.`,
      };

    case 'owner_heartbeat_reminder':
      return {
        subject: `Aegis: Check-in reminder for '${switchName}'`,
        body: `Reminder: Your '${switchName}' switch requires check-in by ${nextActionAt}. Please log in and check in to reset the timer.`,
      };

    case 'owner_warning_started':
      return {
        subject: `Aegis: Warning period started for '${switchName}'`,
        body: `Warning: '${switchName}' has entered the warning period. Please check in soon to prevent the switch from triggering.`,
      };

    case 'owner_trigger_reached_local_only':
      return {
        subject: `Aegis: Switch '${switchName}' has been triggered`,
        body: `'${switchName}' has been triggered. Aegis is preparing to notify your contacts (packet/release in Phase 3).`,
      };
  }
}
