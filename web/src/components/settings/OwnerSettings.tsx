import { useState } from 'react';
import { put } from '../../lib/api';

const T = {
  bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A',
  surface: '#C8D9ED', border: '#8AAAC8', danger: '#C0392B',
};

const inputStyle = {
  width: '100%', background: T.bg, border: `1px solid ${T.border}`,
  color: T.ink, padding: '6px 10px', borderRadius: '4px',
  fontFamily: 'monospace', fontSize: '0.85rem', outline: 'none',
  boxSizing: 'border-box' as const,
};

const labelStyle = {
  fontFamily: 'monospace', fontSize: '0.72rem', color: '#4A6B8A',
  textTransform: 'uppercase' as const, letterSpacing: '0.04em',
  display: 'block', marginBottom: '3px',
};

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
  const [displayName, setDisplayName] = useState(data.displayName);
  const [email, setEmail] = useState(data.email);
  const [phone, setPhone] = useState(data.phone ?? '');
  const [timezone, setTimezone] = useState(data.timezone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
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
        <label style={labelStyle}>Display Name</label>
        <input style={inputStyle} value={displayName} onChange={e => setDisplayName(e.target.value)} required />
      </div>
      <div>
        <label style={labelStyle}>Email</label>
        <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
      </div>
      <div>
        <label style={labelStyle}>Phone (optional)</label>
        <input style={inputStyle} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
      </div>
      <div>
        <label style={labelStyle}>Timezone</label>
        <select style={{ ...inputStyle }} value={timezone} onChange={e => setTimezone(e.target.value)}>
          {TIMEZONES.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
          {!TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
        </select>
      </div>

      {error && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: T.danger }}>{error}</div>}
      {success && <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#2E7D32' }}>{success}</div>}

      <button type="submit" disabled={saving} style={{
        fontFamily: 'monospace', fontSize: '0.85rem', padding: '7px 16px', alignSelf: 'flex-start',
        background: saving ? T.border : T.accent, color: '#fff',
        border: `1.5px solid ${T.accent}`, borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
        cursor: saving ? 'not-allowed' : 'pointer',
      }}>{saving ? 'Saving…' : 'Save Profile'}</button>
    </form>
  );
}
