import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { get, post, invalidateCsrfToken } from './lib/api';
import { useTheme } from './lib/theme';
import AppShell from './components/layout/AppShell';
import { OSS_NAV_ITEMS } from './components/layout/navModel';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Switches from './pages/Switches';
import Settings from './pages/Settings';
import Release from './pages/Release';
import AuditLog from './pages/AuditLog';
import ClaimPortal from './pages/claim/ClaimPortal';

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
    <AppShell navItems={OSS_NAV_ITEMS} releaseTo="/release" onLogout={handleLogout}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/switches" element={<Switches />} />
        <Route path="/release" element={<Release />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  const t = useTheme();
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Caveat', cursive, sans-serif", fontSize: '2rem', background: t.bg, color: t.ink }}>
        Loading…
      </div>
    );
  }

  // Public claim portal — accessible without auth, no sidebar
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
