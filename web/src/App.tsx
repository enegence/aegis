import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { get } from './lib/api';
import Login from './pages/Login';

function App() {
  const [authStatus, setAuthStatus] = useState<'loading' | 'setup' | 'login' | 'authenticated'>('loading');

  useEffect(() => {
    checkAuth();
  }, []);

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
      <div className="min-h-screen flex items-center justify-center font-hand text-3xl">
        Loading...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login onAuth={() => setAuthStatus('authenticated')} mode={authStatus === 'setup' ? 'setup' : 'login'} />} />
      <Route path="/dashboard" element={authStatus === 'authenticated' ? <div className="p-8 font-hand text-3xl">Dashboard — Coming Soon</div> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to={authStatus === 'authenticated' ? '/dashboard' : '/login'} />} />
    </Routes>
  );
}

export default App;
