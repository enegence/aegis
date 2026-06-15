import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appShellSource = readFileSync(resolve(here, 'AppShell.tsx'), 'utf-8');
const indexCss = readFileSync(resolve(here, '../../index.css'), 'utf-8');

describe('AppShell layout regressions', () => {
  it('does not show optimistic hard-coded operational status by default', () => {
    expect(appShellSource).not.toContain('Packet Mirror: Synced');
    expect(appShellSource).not.toContain('Status: Armed');
  });

  it('uses responsive shell classes with a mobile breakpoint', () => {
    expect(appShellSource).toContain('className="app-shell"');
    expect(appShellSource).toContain('className="app-shell__sidebar"');
    expect(appShellSource).toContain('className="app-shell__main"');
    expect(indexCss).toContain('@media (max-width: 720px)');
    expect(indexCss).toContain('.app-shell__sidebar');
  });
});
