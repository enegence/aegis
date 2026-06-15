import { useState, useEffect } from 'react';
import { get, del } from '../lib/api';
import type { Switch, SwitchReadiness } from '@aegis/shared';
import SwitchCard from '../components/switches/SwitchCard';
import SwitchForm from '../components/switches/SwitchForm';
import ReadinessChecklist from '../components/switches/ReadinessChecklist';
import SwitchActionButtons from '../components/switches/SwitchActionButtons';
import { useTheme } from '../lib/theme';
import { createActionButtonStyle } from '../lib/themeStyles';

export default function Switches() {
  const t = useTheme();
  const [switches, setSwitches] = useState<Switch[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [readiness, setReadiness] = useState<SwitchReadiness | null>(null);
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const selected = switches.find(s => s.id === selectedId) ?? null;

  useEffect(() => { loadSwitches(); }, []);

  async function loadSwitches() {
    setLoading(true);
    try {
      const data = await get<Switch[]>('/api/switches');
      setSwitches(data);
    } catch {
      setError('Failed to load switches');
    } finally {
      setLoading(false);
    }
  }

  async function selectSwitch(sw: Switch) {
    setSelectedId(sw.id);
    setView('list');
    setReadiness(null);
    try {
      const r = await get<SwitchReadiness>(`/api/switches/${sw.id}/readiness`);
      setReadiness(r);
    } catch { /* non-fatal */ }
  }

  function updateSwitch(updated: Switch) {
    setSwitches(prev => prev.map(s => s.id === updated.id ? updated : s));
    setSelectedId(updated.id);
    selectSwitch(updated);
  }

  async function deleteSelected() {
    if (!selected) return;
    if (!confirm(`Delete switch "${selected.name}"?`)) return;
    try {
      await del(`/api/switches/${selected.id}`);
      setSwitches(prev => prev.filter(s => s.id !== selected.id));
      setSelectedId(null);
      setReadiness(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '32px', fontFamily: "'JetBrains Mono',monospace", color: t.ink }}>Loading…</div>
    );
  }

  return (
    <div>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '2rem', fontWeight: 'bold', color: t.ink, margin: 0 }}>
            Switches
          </h1>
          {view !== 'create' && (
            <button
              onClick={() => { setView('create'); setSelectedId(null); setReadiness(null); }}
              style={{ ...createActionButtonStyle(t, 'outline', false), padding: '8px 18px' }}
            >+ New Switch</button>
          )}
        </div>

        {error && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.85rem', color: t.danger, marginBottom: '12px' }}>
            {error}
          </div>
        )}

        {view === 'create' && (
          <div style={{
            padding: '16px', background: t.surface,
            border: `2px solid ${t.accent}`,
            borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px',
            marginBottom: '20px',
          }}>
            <h2 style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '1.4rem', color: t.ink, margin: '0 0 12px' }}>
              Create Switch
            </h2>
            <SwitchForm
              onSaved={sw => { setSwitches(prev => [...prev, sw]); setView('list'); selectSwitch(sw); }}
              onCancel={() => setView('list')}
            />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: '20px' }}>
          <div>
            {switches.length === 0 && view !== 'create' ? (
              <div style={{
                padding: '40px', textAlign: 'center',
                background: t.surface, border: `2px dashed ${t.border}`,
                borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px',
                fontFamily: "'JetBrains Mono',monospace", color: t.muted,
              }}>
                <div style={{ fontSize: '1.1rem', marginBottom: '8px' }}>No switches yet</div>
                <div style={{ fontSize: '0.8rem' }}>Create a switch to start monitoring your deadman.</div>
              </div>
            ) : (
              switches.map(sw => (
                <SwitchCard
                  key={sw.id}
                  sw={sw}
                  selected={sw.id === selectedId}
                  onSelect={() => selectSwitch(sw)}
                />
              ))
            )}
          </div>

          {selected && view !== 'create' && (
            <div style={{
              padding: '16px', background: t.surface,
              border: `2px solid ${t.border}`,
              borderRadius: '3px 10px 3px 10px / 10px 3px 10px 3px',
              height: 'fit-content',
            }}>
              {view === 'edit' ? (
                <>
                  <h2 style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '1.4rem', color: t.ink, margin: '0 0 12px' }}>
                    Edit Switch
                  </h2>
                  <SwitchForm
                    existing={selected}
                    onSaved={sw => { updateSwitch(sw); setView('list'); }}
                    onCancel={() => setView('list')}
                  />
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h2 style={{ fontFamily: "'Caveat', cursive, sans-serif", fontSize: '1.4rem', color: t.ink, margin: 0 }}>
                      {selected.name}
                    </h2>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => setView('edit')} style={{ ...createActionButtonStyle(t, 'secondary', false), padding: '4px 10px', fontSize: '0.76rem' }}>Edit</button>
                      <button onClick={deleteSelected} style={{ ...createActionButtonStyle(t, 'danger', false), padding: '4px 10px', fontSize: '0.76rem' }}>Delete</button>
                    </div>
                  </div>

                  <SwitchActionButtons
                    sw={selected}
                    onUpdate={updateSwitch}
                    onError={setError}
                  />

                  {readiness && <ReadinessChecklist readiness={readiness} />}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
