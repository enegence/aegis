import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { get, post, invalidateCsrfToken } from './lib/api';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Switches from './pages/Switches';
import Settings from './pages/Settings';
import Release from './pages/Release';
import AuditLog from './pages/AuditLog';
import ClaimPortal from './pages/claim/ClaimPortal';

const T = {
  bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A',
  surface: '#C8D9ED', border: '#8AAAC8',
};

function Nav({ onLogout }: { onLogout: () => void }) {
  const linkStyle = ({ isActive }: { isActive: boolean }) => ({
    fontFamily: 'monospace', fontSize: '0.85rem',
    color: isActive ? T.accent : T.ink, textDecoration: 'none',
    fontWeight: isActive ? 700 : 400,
    padding: '4px 8px',
    borderBottom: isActive ? `2px solid ${T.accent}` : '2px solid transparent',
  });

  return (
    <nav style={{
      background: T.surface, borderBottom: `2px solid ${T.border}`,
      padding: '0 24px', display: 'flex', alignItems: 'center', gap: '4px', height: '44px',
    }}>
      <span style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '1.2rem', fontWeight: 'bold', color: T.ink, marginRight: '16px' }}>
        Aegis
      </span>
      <NavLink to="/dashboard" style={linkStyle}>Dashboard</NavLink>
      <NavLink to="/switches" style={linkStyle}>Switches</NavLink>
      <NavLink to="/release" style={linkStyle}>Release</NavLink>
      <NavLink to="/audit-log" style={linkStyle}>Audit</NavLink>
      <NavLink to="/settings" style={linkStyle}>Settings</NavLink>
      <div style={{ flex: 1 }} />
      <button
        onClick={onLogout}
        style={{
          fontFamily: 'monospace', fontSize: '0.78rem',
          background: 'transparent', border: `1px solid ${T.border}`,
          borderRadius: '4px', color: '#4A6B8A', cursor: 'pointer', padding: '3px 10px',
        }}
      >Log out</button>
    </nav>
  );
}

function AuthedApp() {
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await post('/api/auth/logout', {});
    } catch { /* proceed anyway */ }
    invalidateCsrfToken();
    navigate('/login');
    window.location.reload();
  }

  return (
    <>
      <Nav onLogout={handleLogout} />
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/switches" element={<Switches />} />
        <Route path="/release" element={<Release />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </>
  );
}

export default function App() {
  const [authStatus, setAuthStatus] = useState<'loading' | 'setup' | 'login' | 'authenticated'>('loading');

  useEffect(() => { checkAuth(); }, []);

  async function checkAuth() {
    try {
      const status = await get<{ setupRequired: boolean }>('/api/auth/status');
      if (status.setupRequired) {
        setAuthStatus('setup');
        return;
      }
      await get('/api/auth/me');
      setAuthStatus('authenticated');
    } catch {
      setAuthStatus('login');
    }
  }

  if (authStatus === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Caveat', cursive, sans-serif", fontSize: '2rem', background: T.bg, color: T.ink }}>
        Loading…
      </div>
    );
  }

  // Public claim portal — accessible without auth
  if (window.location.pathname.startsWith('/claim/')) {
    return (
      <Routes>
        <Route path="/claim/:token" element={<ClaimPortal />} />
        <Route path="*" element={<ClaimPortal />} />
      </Routes>
    );
  }

  if (authStatus === 'setup') {
    return <Setup onSetupComplete={() => setAuthStatus('authenticated')} />;
  }

  if (authStatus !== 'authenticated') {
    return (
      <Routes>
        <Route path="*" element={<Login onAuth={() => setAuthStatus('authenticated')} />} />
      </Routes>
    );
  }

  return <AuthedApp />;
}
