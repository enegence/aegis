import { useState } from 'react';
import { put } from '../../lib/api';
import { useTheme } from '../../lib/theme';
import { createActionButtonStyle, createInputStyle, createLabelStyle, toneTextColor } from '../../lib/themeStyles';

interface OwnerData {
  displayName: string;
  email: string;
  phone: string | null;
  timezone: string;
}

interface Props {
  data: OwnerData;
  onSaved: () => void;
}

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Amsterdam', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Kolkata',
  'Australia/Sydney', 'Pacific/Auckland',
];

export default function OwnerSettings({ data, onSaved }: Props) {
  const t = useTheme();
  const inputStyle = createInputStyle(t);
  const labelStyle = createLabelStyle(t);
  const [displayName, setDisplayName] = useState(data.displayName);
  const [email, setEmail] = useState(data.email);
  const [phone, setPhone] = useState(data.phone ?? '');
  const [timezone, setTimezone] = useState(data.timezone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await put('/api/settings/owner', {
        displayName,
        email,
        phone: phone.trim() || null,
        timezone,
      });
      setSuccess('Profile saved.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <label htmlFor="owner-display-name" style={labelStyle}>Display Name</label>
        <input id="owner-display-name" style={inputStyle} value={displayName} onChange={e => setDisplayName(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="owner-email" style={labelStyle}>Email</label>
        <input id="owner-email" style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="owner-phone" style={labelStyle}>Phone (optional)</label>
        <input id="owner-phone" style={inputStyle} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
      </div>
      <div>
        <label htmlFor="owner-timezone" style={labelStyle}>Timezone</label>
        <select id="owner-timezone" style={inputStyle} value={timezone} onChange={e => setTimezone(e.target.value)}>
          {TIMEZONES.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
          {!TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
        </select>
      </div>

      {error && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: t.danger }}>{error}</div>}
      {success && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.8rem', color: toneTextColor(t, 'success') }}>{success}</div>}

      <button type="submit" disabled={saving} style={{ ...createActionButtonStyle(t, 'primary', saving), alignSelf: 'flex-start' }}>
        {saving ? 'Saving…' : 'Save Profile'}
      </button>
    </form>
  );
}
