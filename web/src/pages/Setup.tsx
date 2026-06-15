import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { useTheme } from '../lib/theme';
import { AegisLockup } from '../components/brand';
import TrustBadges from '../components/brand/TrustBadges';
import { InkButton } from '../components/ui';

const T = {
  bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A',
  surface: '#C8D9ED', border: '#8AAAC8', muted: '#4A6B8A',
  warn: '#7a3c00',
};

const DEPLOYMENT_MODES = [
  {
    id: 'vault',
    label: 'Vault Mode',
    description: 'Store and organize your legacy information locally. Notifications are sent when the switch triggers.',
    limitation: 'Vault Mode is local planning and storage. If this machine is offline, destroyed, or inaccessible at trigger time, automated release may not occur.',
  },
  {
    id: 'dead_drop',
    label: 'Packet Mirror',
    description: 'Encrypted packets are mirrored to S3-compatible storage so the ciphertext survives local server loss.',
    limitation: 'Contacts can download encrypted packets from S3, but cannot decrypt them if the decryption key is unavailable (server offline with no relay escrow).',
  },
  {
    id: 'relay_monitoring',
    label: 'Relay Monitoring',
    description: 'An Aegis Relay service monitors your heartbeat and alerts if it stops. Does not provide automated release.',
    limitation: 'Relay Monitoring tracks heartbeats only. It does not execute release or provide key escrow.',
  },
  {
    id: 'relay_escrow',
    label: 'Relay Escrow',
    description: 'Encrypted key material is held by an Aegis Relay service and released to contacts on trigger.',
    limitation: 'Relay Escrow requires a configured and trusted Relay provider. Your security depends on the Relay operator.',
  },
] as const;

type DeploymentMode = typeof DEPLOYMENT_MODES[number]['id'];

interface SetupData {
  displayName: string;
  email: string;
  phone: string;
  timezone: string;
  password: string;
  confirmPassword: string;
  deploymentMode: DeploymentMode;
  acknowledgedGeneral: boolean;
  acknowledgedMode: boolean;
}

interface SetupProps {
  onSetupComplete: () => void;
}

function FieldError({ id, msg }: { id?: string; msg: string }) {
  return msg ? (
    <p id={id} role="alert" aria-live="assertive" style={{ color: '#c0392b', fontSize: '0.78rem', margin: '4px 0 0' }}>
      {msg}
    </p>
  ) : null;
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} style={{ fontSize: '0.82rem', color: T.muted, display: 'block', marginBottom: 4 }}>
      {children}
    </label>
  );
}

function Input({ id, value, onChange, type = 'text', placeholder, required, describedBy }: {
  id: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
  required?: boolean; describedBy?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      aria-required={required ? 'true' : undefined}
      aria-describedby={describedBy}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '8px 10px',
        fontFamily: 'monospace', fontSize: '0.85rem',
        border: `1.5px solid ${T.border}`, borderRadius: 4,
        background: '#fff', color: T.ink,
        outline: focused ? '2px solid #1A6B9A' : 'none',
        outlineOffset: focused ? '2px' : undefined,
      }}
    />
  );
}

function Btn({ onClick, disabled, children, secondary, type, 'aria-busy': ariaBusy }: {
  onClick?: () => void; disabled?: boolean; children: React.ReactNode; secondary?: boolean;
  type?: 'button' | 'submit'; 'aria-busy'?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled}
      aria-busy={ariaBusy}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        padding: '9px 20px', fontFamily: 'monospace', fontSize: '0.85rem',
        background: secondary ? 'transparent' : (disabled ? '#8AAAC8' : T.accent),
        color: secondary ? T.muted : '#fff',
        border: secondary ? `1px solid ${T.border}` : 'none',
        borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer',
        marginRight: 8,
        outline: focused ? '2px solid #1A6B9A' : 'none',
        outlineOffset: focused ? '2px' : undefined,
      }}
    >
      {children}
    </button>
  );
}

export default function Setup({ onSetupComplete }: SetupProps) {
  const t = useTheme();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [data, setData] = useState<SetupData>({
    displayName: '',
    email: '',
    phone: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    password: '',
    confirmPassword: '',
    deploymentMode: 'vault',
    acknowledgedGeneral: false,
    acknowledgedMode: false,
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof SetupData, string>>>({});

  function set<K extends keyof SetupData>(k: K, v: SetupData[K]) {
    setData(d => ({ ...d, [k]: v }));
    setFieldErrors(e => ({ ...e, [k]: '' }));
  }

  const selectedMode = DEPLOYMENT_MODES.find(m => m.id === data.deploymentMode)!;

  // ─── Step validation ────────────────────────────────────────────────────────

  function validateProfile(): boolean {
    const errs: Partial<Record<keyof SetupData, string>> = {};
    if (!data.displayName.trim()) errs.displayName = 'Name is required';
    if (!data.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errs.email = 'Valid email required';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateSecurity(): boolean {
    const errs: Partial<Record<keyof SetupData, string>> = {};
    if (data.password.length < 12) errs.password = 'Password must be at least 12 characters';
    if (data.password !== data.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateAck(): boolean {
    const errs: Partial<Record<keyof SetupData, string>> = {};
    if (!data.acknowledgedGeneral) errs.acknowledgedGeneral = 'You must acknowledge this before continuing';
    if (!data.acknowledgedMode) errs.acknowledgedMode = 'You must acknowledge the deployment mode limitation';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function nextStep() {
    setError('');
    if (step === 1 && !validateProfile()) return;
    if (step === 2 && !validateSecurity()) return;
    if (step === 4 && !validateAck()) return;
    setStep(s => s + 1);
  }

  async function submit() {
    if (!validateAck()) return;
    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/api/setup', {
        method: 'POST',
        body: JSON.stringify({
          displayName: data.displayName,
          email: data.email,
          phone: data.phone || undefined,
          password: data.password,
          timezone: data.timezone,
          deploymentMode: data.deploymentMode,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      onSetupComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const steps = ['Welcome', 'Profile', 'Security', 'Deployment', 'Acknowledge', 'Review'];

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 520, background: T.surface, border: `2px solid ${T.border}`, borderRadius: '4px 12px 4px 12px / 12px 4px 12px 4px', padding: 32 }}>

        {/* aria-live region for async status */}
        <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
          {submitting ? 'Creating your account…' : ''}
        </div>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 10 }}>
            <AegisLockup size="sm" color={T.ink} />
          </div>
          <div style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '1.8rem', fontWeight: 'bold', color: T.ink, marginBottom: 4 }}>
            Aegis Setup
          </div>
          <div role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={steps.length} aria-label={`Step ${step + 1} of ${steps.length}: ${steps[step]}`} style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {steps.map((s, i) => (
              <div key={s} aria-hidden="true" style={{
                height: 4, flex: 1, borderRadius: 2,
                background: i <= step ? T.accent : T.border,
                transition: 'background 0.2s',
              }} />
            ))}
          </div>
          <p aria-hidden="true" style={{ fontSize: '0.78rem', color: T.muted, marginTop: 6 }}>
            Step {step + 1} of {steps.length}: {steps[step]}
          </p>
        </div>

        {/* ── Step 0: Welcome (branded hero) ──────────────────────────────── */}
        {step === 0 && (
          <div style={{ position: 'relative', textAlign: 'center' }}>
            <svg style={{ position: 'absolute', top: -8, left: -8, opacity: 0.15 }} width="56" height="56" viewBox="0 0 80 80" fill="none">
              <path d="M4 76 L4 4 L76 4" stroke={t.ink} strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <circle cx="4" cy="4" r="4" fill={t.ink} />
            </svg>
            <svg style={{ position: 'absolute', bottom: -8, right: -8, opacity: 0.15, transform: 'rotate(180deg)' }} width="56" height="56" viewBox="0 0 80 80" fill="none">
              <path d="M4 76 L4 4 L76 4" stroke={t.ink} strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <circle cx="4" cy="4" r="4" fill={t.ink} />
            </svg>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <AegisLockup size="lg" color={t.ink} />
            </div>
            <h2 style={{ fontFamily: "'Caveat',cursive", fontSize: '2rem', fontWeight: 700, color: t.ink, margin: '0 0 10px' }}>
              What happens after you're gone?
            </h2>
            <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.82rem', color: t.muted, lineHeight: 1.8, maxWidth: 420, margin: '0 auto 20px' }}>
              Aegis is a privacy-first digital legacy release system.<br />
              Your estate info, delivered to trusted people — automatically.<br />
              If you don't check in, it knows.
            </p>

            <div style={{ marginBottom: 20 }}>
              <TrustBadges />
            </div>

            {/* Retained legal disclaimer */}
            <div style={{ background: t.bg, border: `1.5px dashed ${t.border}`, borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px', padding: 14, margin: '0 0 20px', fontFamily: "'JetBrains Mono',monospace", fontSize: '0.78rem', color: t.muted, lineHeight: 1.6, textAlign: 'left' }}>
              <strong style={{ color: t.ink }}>Aegis is not:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>A will or legal document</li>
                <li>A password manager</li>
                <li>A guarantee of delivery under all conditions</li>
                <li>A professional estate planning service</li>
              </ul>
            </div>

            <InkButton size="lg" onClick={nextStep}>Set Up Your Switch →</InkButton>
          </div>
        )}

        {/* ── Step 1: Profile ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: '1.1rem', color: T.ink, marginTop: 0 }}>Owner Profile</h2>
            <div style={{ marginBottom: 14 }}>
              <Label htmlFor="setup-displayName">Display name *</Label>
              <Input id="setup-displayName" value={data.displayName} onChange={v => set('displayName', v)} placeholder="Your name" required describedBy={fieldErrors.displayName ? 'err-displayName' : undefined} />
              <FieldError id="err-displayName" msg={fieldErrors.displayName ?? ''} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <Label htmlFor="setup-email">Email *</Label>
              <Input id="setup-email" value={data.email} onChange={v => set('email', v)} type="email" placeholder="you@example.com" required describedBy={fieldErrors.email ? 'err-email' : undefined} />
              <FieldError id="err-email" msg={fieldErrors.email ?? ''} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <Label htmlFor="setup-phone">Phone (optional)</Label>
              <Input id="setup-phone" value={data.phone} onChange={v => set('phone', v)} type="tel" placeholder="+1 555 000 0000" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <Label htmlFor="setup-timezone">Timezone</Label>
              <Input id="setup-timezone" value={data.timezone} onChange={v => set('timezone', v)} placeholder="UTC" />
            </div>
            <Btn secondary onClick={() => setStep(s => s - 1)}>← Back</Btn>
            <Btn onClick={nextStep}>Next →</Btn>
          </div>
        )}

        {/* ── Step 2: Security ────────────────────────────────────────────── */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: '1.1rem', color: T.ink, marginTop: 0 }}>Security</h2>
            <p style={{ fontSize: '0.82rem', color: T.muted, marginTop: 0 }}>
              Choose a strong password. Aegis does not have password recovery — if you lose it, you'll need
              to reset the database. We recommend a passphrase of 4+ random words.
            </p>
            <div style={{ marginBottom: 14 }}>
              <Label htmlFor="setup-password">Password (min 12 characters) *</Label>
              <Input id="setup-password" value={data.password} onChange={v => set('password', v)} type="password" placeholder="••••••••••••" required describedBy={fieldErrors.password ? 'err-password' : undefined} />
              <FieldError id="err-password" msg={fieldErrors.password ?? ''} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <Label htmlFor="setup-confirmPassword">Confirm password *</Label>
              <Input id="setup-confirmPassword" value={data.confirmPassword} onChange={v => set('confirmPassword', v)} type="password" placeholder="••••••••••••" required describedBy={fieldErrors.confirmPassword ? 'err-confirmPassword' : undefined} />
              <FieldError id="err-confirmPassword" msg={fieldErrors.confirmPassword ?? ''} />
            </div>
            <Btn secondary onClick={() => setStep(s => s - 1)}>← Back</Btn>
            <Btn onClick={nextStep}>Next →</Btn>
          </div>
        )}

        {/* ── Step 3: Deployment mode ─────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: '1.1rem', color: T.ink, marginTop: 0 }}>Deployment Mode</h2>
            <p style={{ fontSize: '0.82rem', color: T.muted, marginTop: 0 }}>
              Choose how Aegis releases your information. You can change this later in Settings.
            </p>
            <div role="radiogroup" aria-label="Deployment mode" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {DEPLOYMENT_MODES.map(mode => {
                const selected = data.deploymentMode === mode.id;
                return (
                  <div
                    key={mode.id}
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => set('deploymentMode', mode.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set('deploymentMode', mode.id); } }}
                    style={{
                      padding: '12px 14px', borderRadius: 4, cursor: 'pointer',
                      border: `2px solid ${selected ? T.accent : T.border}`,
                      background: selected ? '#e8f0f8' : '#fff',
                      outline: 'none',
                    }}
                    onFocus={e => { e.currentTarget.style.outline = '2px solid #1A6B9A'; e.currentTarget.style.outlineOffset = '2px'; }}
                    onBlur={e => { e.currentTarget.style.outline = 'none'; }}
                  >
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: T.ink }}>{mode.label}</div>
                    <div style={{ fontSize: '0.8rem', color: T.muted, marginTop: 4 }}>{mode.description}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 20 }}>
              <Btn secondary onClick={() => setStep(s => s - 1)}>← Back</Btn>
              <Btn onClick={nextStep}>Next →</Btn>
            </div>
          </div>
        )}

        {/* ── Step 4: Acknowledgements ─────────────────────────────────────── */}
        {step === 4 && (
          <div>
            <h2 style={{ fontSize: '1.1rem', color: T.ink, marginTop: 0 }}>Acknowledgements</h2>

            <div style={{ background: '#fff3cd', border: '1px solid #f0c040', borderRadius: 4, padding: 14, marginBottom: 16, fontSize: '0.82rem', color: T.warn }}>
              <strong>Selected: {selectedMode.label}</strong>
              <p style={{ margin: '6px 0 0' }}>{selectedMode.limitation}</p>
            </div>

            <label htmlFor="ack-general" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4, cursor: 'pointer' }}>
              <input
                id="ack-general"
                type="checkbox"
                checked={data.acknowledgedGeneral}
                onChange={e => set('acknowledgedGeneral', e.target.checked)}
                aria-required="true"
                aria-describedby={fieldErrors.acknowledgedGeneral ? 'err-ack-general' : undefined}
                style={{ marginTop: 2, flexShrink: 0 }}
              />
              <span style={{ fontSize: '0.82rem', color: T.ink, lineHeight: 1.5 }}>
                I understand Aegis is not a will, legal service, password manager, or guarantee of delivery.
                Release reliability depends on the deployment mode and configured services.
              </span>
            </label>
            <FieldError id="err-ack-general" msg={fieldErrors.acknowledgedGeneral ?? ''} />

            <div style={{ marginBottom: 20 }}>
              <label htmlFor="ack-mode" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4, cursor: 'pointer' }}>
                <input
                  id="ack-mode"
                  type="checkbox"
                  checked={data.acknowledgedMode}
                  onChange={e => set('acknowledgedMode', e.target.checked)}
                  aria-required="true"
                  aria-describedby={fieldErrors.acknowledgedMode ? 'err-ack-mode' : undefined}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <span style={{ fontSize: '0.82rem', color: T.ink, lineHeight: 1.5 }}>
                  I understand the limitations of {selectedMode.label} described above.
                </span>
              </label>
              <FieldError id="err-ack-mode" msg={fieldErrors.acknowledgedMode ?? ''} />
            </div>

            <Btn secondary onClick={() => setStep(s => s - 1)}>← Back</Btn>
            <Btn onClick={nextStep}>Next →</Btn>
          </div>
        )}

        {/* ── Step 5: Review + Submit ──────────────────────────────────────── */}
        {step === 5 && (
          <div>
            <h2 style={{ fontSize: '1.1rem', color: T.ink, marginTop: 0 }}>Review & Create Account</h2>
            <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 4, padding: 14, fontSize: '0.82rem', color: T.ink, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 0', lineHeight: 1.6 }}>
                <span style={{ color: T.muted }}>Name</span><span>{data.displayName}</span>
                <span style={{ color: T.muted }}>Email</span><span>{data.email}</span>
                {data.phone && <><span style={{ color: T.muted }}>Phone</span><span>{data.phone}</span></>}
                <span style={{ color: T.muted }}>Timezone</span><span>{data.timezone}</span>
                <span style={{ color: T.muted }}>Password</span><span>{'•'.repeat(Math.min(data.password.length, 12))}</span>
                <span style={{ color: T.muted }}>Mode</span><span>{selectedMode.label}</span>
              </div>
            </div>

            {error && (
              <div role="alert" aria-live="assertive" style={{ background: '#fde', border: '1px solid #c0392b', borderRadius: 4, padding: 10, marginBottom: 14, fontSize: '0.82rem', color: '#c0392b' }}>
                {error}
              </div>
            )}

            <Btn secondary onClick={() => setStep(s => s - 1)}>← Back</Btn>
            <Btn onClick={submit} disabled={submitting} aria-busy={submitting}>
              {submitting ? 'Creating account…' : 'Create account →'}
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}
