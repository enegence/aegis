import { post } from '../../lib/api';
import type { Switch } from '@aegis/shared';
import { useTheme } from '../../lib/theme';
import { createActionButtonStyle, toneTextColor } from '../../lib/themeStyles';

interface Props {
  sw: Switch;
  onUpdate: (updated: Switch) => void;
  onError: (msg: string) => void;
}

const ARMABLE = new Set(['draft', 'paused']);
const PAUSABLE = new Set(['armed', 'warning']);
const CANCELLABLE = new Set(['draft', 'armed', 'paused', 'warning']);
const CHECKIN = new Set(['armed', 'warning']);

export default function SwitchActionButtons({ sw, onUpdate, onError }: Props) {
  const t = useTheme();

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
      <button style={createActionButtonStyle(t, 'outline', !ARMABLE.has(sw.status))} disabled={!ARMABLE.has(sw.status)} onClick={() => act('arm')}>Arm</button>
      <button style={createActionButtonStyle(t, 'secondary', !PAUSABLE.has(sw.status))} disabled={!PAUSABLE.has(sw.status)} onClick={() => act('pause')}>Pause</button>
      <button style={createActionButtonStyle(t, 'danger', !CANCELLABLE.has(sw.status))} disabled={!CANCELLABLE.has(sw.status)} onClick={() => act('cancel')}>Cancel</button>
      <button
        style={{ ...createActionButtonStyle(t, 'secondary', !CHECKIN.has(sw.status)), color: !CHECKIN.has(sw.status) ? t.bg : toneTextColor(t, 'success'), borderColor: !CHECKIN.has(sw.status) ? t.border : toneTextColor(t, 'success') }}
        disabled={!CHECKIN.has(sw.status)}
        onClick={() => act('check-in')}
      >Check In</button>
      <button style={{ ...createActionButtonStyle(t, 'secondary', false), color: toneTextColor(t, 'warning'), borderColor: toneTextColor(t, 'warning') }} onClick={() => act('evaluate')} title="Force evaluation (dev/test)">Evaluate</button>
    </div>
  );
}
