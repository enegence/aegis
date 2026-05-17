import type { NavItem } from './AppShell';
import {
  IconDashboard,
  IconTrigger,
  IconRelease,
  IconLegacy,
  IconSettings,
} from '../icons';

// OSS self-hosted app nav (single-owner; matches App.tsx routes).
export const OSS_NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', to: '/dashboard', Icon: IconDashboard },
  { key: 'switches', label: 'Switches', to: '/switches', Icon: IconTrigger },
  { key: 'release', label: 'Release', to: '/release', Icon: IconRelease },
  { key: 'audit', label: 'Audit', to: '/audit-log', Icon: IconLegacy },
  { key: 'settings', label: 'Settings', to: '/settings', Icon: IconSettings },
];
