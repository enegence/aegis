import { post } from '../../lib/api';
import type { Switch } from '@aegis/shared';

interface Props {
  sw: Switch;
  onUpdate: (updated: Switch) => void;
  onError: (msg: string) => void;
}

const T = {
  bg: '#DDE8F4', ink: '#0B1C2C', accent: '#1A6B9A',
  surface: '#C8D9ED', border: '#8AAAC8', danger: '#C0392B',
};

const btn = (color: string, disabled: boolean) => ({
  background: disabled ? T.surface : color,
  color: disabled ? T.border : '#fff',
  border: `1.5px solid ${disabled ? T.border : color}`,
  borderRadius: '3px 6px 3px 6px / 6px 3px 6px 3px',
  padding: '4px 12px',
  fontSize: '0.75rem',
  fontFamily: 'monospace',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
});

const ARMABLE = new Set(['draft', 'paused']);
const PAUSABLE = new Set(['armed', 'warning']);
const CANCELLABLE = new Set(['draft', 'armed', 'paused', 'warning']);
const CHECKIN = new Set(['armed', 'warning']);

export default function SwitchActionButtons({ sw, onUpdate, onError }: Props) {
  async function act(action: string) {
    try {
      const updated = await post<Switch>(`/api/switches/${sw.id}/${action}`, {});
      onUpdate(updated);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Action failed');
    }
  }

  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
      <button
        style={btn(T.accent, !ARMABLE.has(sw.status))}
        disabled={!ARMABLE.has(sw.status)}
        onClick={() => act('arm')}
      >Arm</button>

      <button
        style={btn('#6B7A8A', !PAUSABLE.has(sw.status))}
        disabled={!PAUSABLE.has(sw.status)}
        onClick={() => act('pause')}
      >Pause</button>

      <button
        style={btn(T.danger, !CANCELLABLE.has(sw.status))}
        disabled={!CANCELLABLE.has(sw.status)}
        onClick={() => act('cancel')}
      >Cancel</button>

      <button
        style={btn('#2E7D32', !CHECKIN.has(sw.status))}
        disabled={!CHECKIN.has(sw.status)}
        onClick={() => act('check-in')}
      >Check In</button>

      <button
        style={{ ...btn('#8B6914', false), borderColor: '#8B6914' }}
        onClick={() => act('evaluate')}
        title="Force evaluation (dev/test)"
      >Evaluate</button>
    </div>
  );
}
