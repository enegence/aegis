# Accessibility — Aegis Core

## Current Accessibility Guarantees

The following accessibility improvements are implemented in Aegis Core as of Phase 5.

### Form label association

Every `<input>` element in critical flows is associated with a visible `<label>` via `id`/`htmlFor`. Affected components:

- **Login** (`web/src/pages/Login.tsx`) — passphrase field, TOTP code field
- **Setup wizard** (`web/src/pages/Setup.tsx`) — display name, email, phone, timezone, password, confirm password, acknowledgement checkboxes
- **SecuritySettings** (`web/src/components/settings/SecuritySettings.tsx`) — TOTP setup code, disable passphrase, disable code
- **ClaimPortal** (`web/src/pages/claim/ClaimPortal.tsx`) — verification PIN

### Error announcements

Error messages use `role="alert"` and `aria-live="assertive"` so screen readers announce them immediately on appearance. Error elements are linked to their relevant input via `aria-describedby`.

### Required field marking

All required inputs carry `aria-required="true"`.

### Loading / async state

- Submit buttons set `aria-busy={true}` while a network request is in flight.
- Each form includes an `aria-live="polite"` visually-hidden region that announces loading state to screen readers without disrupting reading flow.
- Non-critical status messages (success confirmations) use `aria-live="polite"`.

### Keyboard interaction

- All interactive elements (buttons, inputs, links) are reachable via Tab.
- Deployment mode selection cards in Setup use `role="radiogroup"` / `role="radio"` with keyboard Enter/Space activation.
- Focus rings are applied on focus via inline `outline` style changes (since the app uses inline CSS-in-JS — Tailwind's `focus-visible:ring` is used in SaaS components).

### Semantic structure

- Multi-step wizard progress uses `role="progressbar"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax`.
- Admin user table has `<th scope="col">` on all column headers and `aria-label` on the table element.
- Admin navigation includes `aria-label="Admin navigation"` and `aria-current="page"` on active links.
- Icon-only buttons (e.g. TOTP toggle) include a descriptive `aria-label`.

## Known Gaps

The following are acknowledged limitations in this alpha release:

1. **No automated a11y CI.** There is no axe-core or pa11y step in CI. Regressions can be introduced without automated detection. A future task should add an axe-playwright step to the E2E suite.

2. **No formal screen reader audit.** No human testing with NVDA, JAWS, VoiceOver, or TalkBack has been performed. The ARIA attributes added are structurally correct per specification but have not been validated against real assistive technology behavior.

3. **Focus management after failed submit.** The spec recommends moving focus to the first errored field after a failed form submission. This is not yet implemented — errors are announced via `role="alert"` but focus stays on the submit button.

4. **Modal/dialog focus trapping.** There are currently no modal dialogs in the OSS UI. If modals are added in future phases, they must implement focus trapping (`aria-modal="true"`, focus lock, return focus on close).

5. **Color contrast not formally audited.** The blue-on-light-blue palette (`#1A6B9A` on `#DDE8F4`) should be verified against WCAG AA (4.5:1 for normal text, 3:1 for large text) with a contrast checker. This has not been done.

6. **No skip navigation link.** Long pages do not have a "Skip to main content" link for keyboard users. Should be added before public release.

7. **Dynamic content in ClaimPortal.** Step progression is driven by state changes that re-render sections. Screen reader users may benefit from a summary `aria-live` announcement when a step completes; only error messages are currently announced assertively.

## How to Test Manually

### Keyboard-only navigation

1. Open the page in a browser.
2. Tab through all interactive elements. Verify each element receives a visible focus ring.
3. Use Enter/Space to activate buttons and radio-style cards.
4. Submit a form with an error. Verify the error message is visible and that the submit button announces "busy" while loading.

### Using axe DevTools (browser extension)

1. Install the [axe DevTools extension](https://www.deque.com/axe/devtools/).
2. Open the Login, Setup, or ClaimPortal page.
3. Run an axe scan (click the extension icon → "Analyze").
4. Review violations. Any "critical" or "serious" violations should be treated as bugs.

### Screen reader testing

- **Windows:** NVDA (free) + Firefox or Chrome
- **macOS / iOS:** VoiceOver (built in) — activate with Cmd+F5 (macOS) or triple-click Home (iOS)
- **Android:** TalkBack (built in)

Test the full login flow and setup wizard with a screen reader. Verify:
- Form labels are read when an input is focused
- Error messages are announced immediately when they appear
- Progress bar step changes are communicated
- "Logging in…" / "Creating account…" states are announced

### Contrast checking

Use [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) or the browser DevTools accessibility panel to verify color contrast ratios on text elements.

## Alpha Limitation Acknowledgment

Aegis Core is in alpha. Accessibility support is improving but has not been independently audited. Users who depend on assistive technology may encounter gaps not listed above. Feedback and bug reports are welcome.
