import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface ClaimSummary {
  claimId: number;
  status: string;
  expiresAt: string;
  pinRequired: boolean;
  openedAt: string | null;
  verifiedAt: string | null;
  acceptedAt: string | null;
  packetDownloadedAt: string | null;
  keyViewedAt: string | null;
  acknowledgedAt: string | null;
}

const T = { bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A', surface: '#C8D9ED', border: '#8AAAC8' };

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 560, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 28, fontFamily: 'monospace' }}>
        {children}
      </div>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 style={{ margin: '0 0 16px', color: T.accent, fontSize: '1.1rem' }}>{children}</h2>;
}

function Btn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: T.accent, color: '#fff', border: 'none', borderRadius: 4,
        padding: '8px 18px', fontFamily: 'monospace', fontSize: '0.88rem',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

async function claimPost(token: string, action: string, body?: object) {
  const res = await fetch(`/api/claim/${token}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

export default function ClaimPortal() {
  const { token } = useParams<{ token: string }>();
  const [claim, setClaim] = useState<ClaimSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<string>('');
  const [keyData, setKeyData] = useState<{ keyBase64: string; algorithm: string } | null>(null);
  const [actionMsg, setActionMsg] = useState('');

  async function loadClaim() {
    if (!token) return;
    try {
      const res = await fetch(`/api/claim/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? 'Claim not found or no longer active');
        setLoading(false);
        return;
      }
      const data = await res.json() as ClaimSummary;
      setClaim(data);
      setStep(data.status);
    } catch {
      setError('Network error — please try again');
    }
    setLoading(false);
  }

  useEffect(() => { loadClaim(); }, [token]);

  async function doOpen() {
    if (!token) return;
    setActionMsg('');
    const res = await claimPost(token, 'open');
    if (res.ok) { await loadClaim(); }
    else { setActionMsg('Failed to open claim'); }
  }

  async function doVerify() {
    if (!token) return;
    setActionMsg('');
    const res = await claimPost(token, 'verify', claim?.pinRequired ? { pin } : undefined);
    if (res.ok) {
      setPin('');
      await loadClaim();
    } else {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setActionMsg(body.error ?? 'Verification failed');
    }
  }

  async function doAccept() {
    if (!token) return;
    setActionMsg('');
    const res = await claimPost(token, 'accept');
    if (res.ok) { await loadClaim(); }
    else { setActionMsg('Failed to accept'); }
  }

  async function doDownload() {
    if (!token) return;
    const res = await fetch(`/api/claim/${token}/packet`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'aegis-packet.bin';
      a.click();
      URL.revokeObjectURL(url);
      await loadClaim();
    } else {
      setActionMsg('Packet download failed');
    }
  }

  async function doViewKey() {
    if (!token) return;
    setActionMsg('');
    const res = await claimPost(token, 'key-view');
    if (res.ok) {
      const body = await res.json() as { keyBase64: string; algorithm: string };
      setKeyData(body);
      await loadClaim();
    } else {
      setActionMsg('Key view failed');
    }
  }

  async function doAcknowledge() {
    if (!token) return;
    setActionMsg('');
    const res = await claimPost(token, 'acknowledge');
    if (res.ok) { await loadClaim(); }
    else { setActionMsg('Acknowledgement failed'); }
  }

  if (loading) {
    return <Section><p style={{ color: T.ink }}>Loading…</p></Section>;
  }

  if (error) {
    return (
      <Section>
        <Heading>Claim Not Available</Heading>
        <p style={{ color: '#c0392b' }}>{error}</p>
        <p style={{ fontSize: '0.82rem', color: '#4A6B8A' }}>
          This link may be expired, already used, or invalid. If you believe this is an error, contact the person who sent you this link.
        </p>
      </Section>
    );
  }

  if (!claim) return null;

  const status = claim.status;
  const expired = new Date(claim.expiresAt) < new Date();

  if (status === 'acknowledged') {
    return (
      <Section>
        <Heading>Receipt Acknowledged</Heading>
        <p style={{ color: T.ink }}>You have already acknowledged this claim. Thank you.</p>
      </Section>
    );
  }

  if (['escalated', 'failed', 'expired'].includes(status) || expired) {
    return (
      <Section>
        <Heading>Claim No Longer Active</Heading>
        <p style={{ color: '#c0392b' }}>
          {expired ? 'This claim has expired.' : `Claim status: ${status}.`}
        </p>
      </Section>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg }}>
      <div style={{ background: T.surface, borderBottom: `2px solid ${T.border}`, padding: '0 24px', height: 44, display: 'flex', alignItems: 'center' }}>
        <span style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '1.2rem', fontWeight: 'bold', color: T.ink }}>Aegis — Trusted Contact Portal</span>
      </div>

      <Section>
        <Heading>Legacy Release — Trusted Contact</Heading>
        <p style={{ color: T.ink, fontSize: '0.88rem', marginBottom: 20 }}>
          You have been designated as a trusted contact. Please review and acknowledge your responsibilities below.
          This link expires: <strong>{new Date(claim.expiresAt).toLocaleString()}</strong>.
        </p>

        {actionMsg && (
          <p style={{ color: '#c0392b', fontSize: '0.85rem', background: '#fde8e8', padding: '6px 10px', borderRadius: 4, marginBottom: 12 }}>
            {actionMsg}
          </p>
        )}

        {/* Step 1: Open */}
        {!claim.openedAt && (
          <div>
            <p style={{ fontSize: '0.85rem', color: '#4A6B8A' }}>Step 1 of 5: Open claim</p>
            <Btn onClick={doOpen}>I understand — open claim</Btn>
          </div>
        )}

        {/* Step 2: Verify */}
        {claim.openedAt && !claim.verifiedAt && (
          <div>
            <p style={{ fontSize: '0.85rem', color: '#4A6B8A' }}>Step 2 of 5: Verify identity</p>
            {claim.pinRequired ? (
              <>
                <p style={{ fontSize: '0.85rem', color: T.ink }}>Enter your verification PIN:</p>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="PIN"
                  style={{ display: 'block', marginBottom: 10, padding: '6px 10px', fontFamily: 'monospace', border: `1px solid ${T.border}`, borderRadius: 4, width: '100%', boxSizing: 'border-box' }}
                />
              </>
            ) : (
              <p style={{ fontSize: '0.85rem', color: T.ink }}>Click to confirm your identity and proceed.</p>
            )}
            <Btn onClick={doVerify}>Verify</Btn>
          </div>
        )}

        {/* Step 3: Accept */}
        {claim.verifiedAt && !claim.acceptedAt && (
          <div>
            <p style={{ fontSize: '0.85rem', color: '#4A6B8A' }}>Step 3 of 5: Accept responsibility</p>
            <p style={{ fontSize: '0.85rem', color: T.ink }}>
              By accepting, you confirm:
            </p>
            <ul style={{ fontSize: '0.82rem', color: T.ink, margin: '8px 0 14px', paddingLeft: 18 }}>
              <li>You may receive sensitive legacy/estate information.</li>
              <li>You will handle this information responsibly and securely.</li>
              <li>You understand this constitutes a legal and ethical responsibility.</li>
            </ul>
            <Btn onClick={doAccept}>I accept responsibility</Btn>
          </div>
        )}

        {/* Step 4: Download + Key View */}
        {claim.acceptedAt && !claim.acknowledgedAt && (
          <div>
            <p style={{ fontSize: '0.85rem', color: '#4A6B8A' }}>Step 4 of 5: Access legacy data</p>
            <p style={{ fontSize: '0.85rem', color: T.ink }}>Download the encrypted packet and the decryption key:</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              <Btn onClick={doDownload}>Download Packet (.bin)</Btn>
              <Btn onClick={doViewKey} disabled={!!keyData}>
                {keyData ? 'Key Retrieved' : 'View Decryption Key'}
              </Btn>
            </div>
            {keyData && (
              <div style={{ marginTop: 14, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 4, padding: 12 }}>
                <p style={{ fontSize: '0.78rem', color: '#c0392b', marginTop: 0 }}>
                  ⚠ This key is shown once. Copy it immediately and store it securely.
                </p>
                <p style={{ fontSize: '0.75rem', color: '#4A6B8A', margin: '4px 0' }}>Algorithm: {keyData.algorithm}</p>
                <code style={{ display: 'block', wordBreak: 'break-all', fontSize: '0.78rem', color: T.ink }}>
                  {keyData.keyBase64}
                </code>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Acknowledge */}
        {claim.keyViewedAt && !claim.acknowledgedAt && (
          <div style={{ marginTop: 20, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
            <p style={{ fontSize: '0.85rem', color: '#4A6B8A' }}>Step 5 of 5: Acknowledge receipt</p>
            <p style={{ fontSize: '0.82rem', color: T.ink }}>
              Once you have downloaded and secured the data, acknowledge receipt to complete the process.
            </p>
            <Btn onClick={doAcknowledge}>Acknowledge receipt</Btn>
          </div>
        )}

        {/* Completed */}
        {claim.acknowledgedAt && (
          <div>
            <p style={{ color: '#27ae60', fontWeight: 'bold' }}>✓ Receipt acknowledged</p>
            <p style={{ fontSize: '0.82rem', color: T.ink }}>Thank you. The release process is now complete.</p>
          </div>
        )}
      </Section>
    </div>
  );
}
