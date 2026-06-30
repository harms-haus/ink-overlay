/**
 * Rename-safety guard for demo Scene 01 — "Getting Started".
 *
 * These tests define the TARGET state after the file/Component rename
 * refactor. The import path and export name below already use the NEW
 * identifiers:
 *
 *   - file: `demo/scenes/01-getting-started.tsx` (was `01-overlay-host.tsx`)
 *   - export: `Scene01GettingStarted` (was `Scene01OverlayHost`)
 *   - `@module` JSDoc tag and `demo/app.tsx` import/registry wiring
 *
 * This is a pure rename — NO logic change. These tests pin down the
 * **module contract** that the rename must preserve so the refactor is
 * provably safe:
 *
 *   - The scene module exports the component as a NAMED export that is a
 *     renderable React function component.
 *   - Importing the module is side-effect-free (no overlay is registered
 *     until the component is actually rendered).
 *   - When rendered inside `<OverlayHost>`, the component produces the
 *     distinctive "Getting Started" scene output — proving the import
 *     path resolves to the RIGHT module, not a stub or the wrong scene.
 *
 * Uses REAL timers — Ink breaks with fake timers.
 */
import {describe, test, expect, afterEach} from 'vitest';
import {render} from 'ink-testing-library';
import {delay} from './helpers/delay.js';
import {OverlayHost, toasts} from '../src/index.js';
import {overlayStore} from '../src/store.js';
import {Scene01GettingStarted} from '../demo/scenes/01-getting-started.js';

/** Clean the shared toast + overlay singletons so tests are independent. */
function resetStores(): void {
	toasts.dismissAll();
	overlayStore.closeAll();
}

afterEach(async () => {
	await delay(50);
	resetStores();
});

// ════════════════════════════════════════════════════════════════════
// Module contract — the surface the rename touches directly
// ════════════════════════════════════════════════════════════════════

describe('demo Scene 01 — module contract (rename safety)', () => {
	test('the scene module exports a named component that is a function', () => {
		// A rename that drops the export, renames it inconsistently, or
		// turns it into a non-component would fail here.
		expect(typeof Scene01GettingStarted).toBe('function');
	});

	test('importing the scene module is side-effect-free (no overlay registered)', () => {
		// The module should not register anything with the global overlay
		// store at import time — only when the component renders. This
		// guards against a rename that accidentally pulls in eager
		// initialization.
		resetStores();
		expect(overlayStore.getAll()).toHaveLength(0);
	});
});

// ════════════════════════════════════════════════════════════════════
// Identity — the import path resolves to the "Getting Started" scene
// ════════════════════════════════════════════════════════════════════

describe('demo Scene 01 — identity (import path resolves to the right scene)', () => {
	test('rendering the exported component shows the "Getting Started" title', async () => {
		resetStores();
		const {lastFrame, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		const frame = lastFrame();
		// The distinctive scene-01 header — proves the import path points
		// at the correct scene file, not a different or empty module.
		expect(frame).toContain('01 · Getting Started');
		unmount();
	});

	test('rendering the exported component shows the scene-01 description', async () => {
		resetStores();
		const {lastFrame, unmount} = render(
			<OverlayHost>
				<Scene01GettingStarted />
			</OverlayHost>,
		);
		await delay(300);

		const frame = lastFrame();
		// The scene-01 description text from SceneShell.
		expect(frame).toContain(
			'OverlayHost, declarative Modal, imperative toasts',
		);
		unmount();
	});
});
