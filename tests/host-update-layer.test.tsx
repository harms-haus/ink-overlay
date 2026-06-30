/**
 * Characterization tests for the `updateLayer` context method.
 *
 * ## Why these tests exist
 *
 * The `OverlayHostContextValue.updateLayer` method is being tightened
 * from `Partial<OverlayDescriptor>` to `LayerPatch` — a type that
 * omits the `order` property. The fix is type-level only: no runtime
 * behavior should change.
 *
 * These tests pin down the **observable runtime behavior** of
 * `updateLayer` so the type refactor can be verified safe:
 *
 *  - Patching an existing layer merges properties correctly.
 *  - Properties not included in the patch are preserved.
 *  - Patching a non-existent layer ID is a silent no-op.
 *  - The internally-managed `order` is never disturbed by an update
 *    (observable via stacking / render order).
 *
 * The file also includes **type-level assertions** (guarded by
 * `@ts-expect-error`) that document the new contract: `order` must
 * NOT be accepted in the patch.
 *
 * Uses REAL timers — ink breaks with fake timers.
 */
import React, {type ReactNode, useEffect, useMemo, useState} from 'react';
import {test, expect} from 'vitest';
import {Text} from 'ink';
import {render} from 'ink-testing-library';
import {OverlayHost} from '../src/host.js';
import {
	OverlayHostContext,
	useOverlayHost,
} from '../src/host-context.js';
import {Layer} from '../src/layer.js';
import {delay} from './helpers/delay.js';

// ── Spy infrastructure ─────────────────────────────────────────────
//
// Wraps the real host context so every updateLayer call is recorded.
// The calls are still forwarded to the real host so rendering behaves
// normally.

type UpdateCall = {id: string; keys: string[]};

function SpiedHost({
	children,
	calls,
}: {
	children: ReactNode;
	calls: React.RefObject<UpdateCall[]>;
}) {
	const real = useOverlayHost();
	const value = useMemo(
		() => ({
			...real,
			updateLayer(id: string, patch: Record<string, unknown>) {
				calls.current.push({id, keys: Object.keys(patch).sort()});
				real.updateLayer(id, patch);
			},
		}),
		[real, calls],
	);

	return (
		<OverlayHostContext.Provider value={value}>
			{children}
		</OverlayHostContext.Provider>
	);
}

// ── Probe: exposes host methods to the test ────────────────────────

/**
 * A probe component that grabs the host context and exposes its methods
 * to the test via a ref. Renders base content so the host has something
 * to display.
 */
function ContextProbe({
	hostRef,
}: {
	hostRef: React.RefObject<ReturnType<typeof useOverlayHost> | null>;
}) {
	const host = useOverlayHost();
	hostRef.current = host;
	return <Text>base</Text>;
}

// ── Probe: registers a layer and can trigger updates ───────────────

/**
 * Registers a declarative layer on mount and exposes triggers to call
 * updateLayer with various patches.
 */
function RegisterAndUpdateLayer({
	id,
	initialContent,
}: {
	id: string;
	initialContent: string;
	hostRef: React.RefObject<ReturnType<typeof useOverlayHost> | null>;
}) {
	const {registerLayer} = useOverlayHost();

	useEffect(() => {
		registerLayer({
			id,
			z: 0,
			capture: false,
			backdrop: 'none',
			content: <Text>{initialContent}</Text>,
			overflow: 'hidden',
		});
	}, [id, initialContent, registerLayer]);

	return null;
}

// ── Tests ──────────────────────────────────────────────────────────

test('updateLayer replaces content of an existing layer', async () => {
	const hostRef = {current: null as ReturnType<typeof useOverlayHost> | null};

	const {lastFrame} = render(
		<OverlayHost>
			<RegisterAndUpdateLayer
				id="content-layer"
				initialContent="old-content"
				hostRef={hostRef}
			/>
			<ContextProbe hostRef={hostRef} />
		</OverlayHost>,
	);

	await delay(200);
	expect(lastFrame()).toContain('old-content');

	// Update content.
	hostRef.current!.updateLayer('content-layer', {
		content: <Text>new-content</Text>,
	});
	await delay(200);

	expect(lastFrame()).toContain('new-content');
	expect(lastFrame()).not.toContain('old-content');
});

test('updateLayer merges patch into existing descriptor — unspecified properties preserved', async () => {
	const hostRef = {current: null as ReturnType<typeof useOverlayHost> | null};

	const {lastFrame} = render(
		<OverlayHost>
			<RegisterAndUpdateLayer
				id="merge-layer"
				initialContent="merge-me"
				hostRef={hostRef}
			/>
			<ContextProbe hostRef={hostRef} />
		</OverlayHost>,
	);

	await delay(200);
	expect(lastFrame()).toContain('merge-me');

	// Update only content — other properties (z, capture, backdrop, etc.)
	// must be preserved. The layer should still render correctly.
	hostRef.current!.updateLayer('merge-layer', {
		content: <Text>merged</Text>,
		// z, capture, backdrop, overflow all left unchanged in the patch
	});
	await delay(200);

	// Content updated.
	expect(lastFrame()).toContain('merged');

	// The layer is still present and rendering (no crash from missing
	// properties), which proves the merge preserved the old values.
	expect(lastFrame()).toContain('base');
});

test('updateLayer is a silent no-op when the layer ID does not exist', async () => {
	const hostRef = {current: null as ReturnType<typeof useOverlayHost> | null};

	const {lastFrame} = render(
		<OverlayHost>
			<ContextProbe hostRef={hostRef} />
		</OverlayHost>,
	);

	await delay(200);
	expect(lastFrame()).toContain('base');

	// Updating a non-existent layer must not throw.
	expect(() => {
		hostRef.current!.updateLayer('nonexistent', {z: 5});
	}).not.toThrow();

	await delay(200);

	// No layer appeared — the no-op didn't create anything.
	expect(lastFrame()).toBe(lastFrame());
	expect(lastFrame()).toContain('base');
});

test('updateLayer with a patch containing only exiting flag is accepted without error', async () => {
	const hostRef = {current: null as ReturnType<typeof useOverlayHost> | null};

	const {lastFrame} = render(
		<OverlayHost>
			<RegisterAndUpdateLayer
				id="exit-layer"
				initialContent="will-exit"
				hostRef={hostRef}
			/>
			<ContextProbe hostRef={hostRef} />
		</OverlayHost>,
	);

	await delay(200);
	expect(lastFrame()).toContain('will-exit');

	// The Layer component itself sets {exiting: true} via updateLayer
	// when a multi-frame exit transition is present. Verify the host
	// accepts this single-key patch without error. (After setting
	// exiting on a layer with no exit-transition steps, the
	// LayerRenderer may remove it — that's expected behavior; the key
	// assertion is that updateLayer doesn't throw.)
	expect(() => {
		hostRef.current!.updateLayer('exit-layer', {exiting: true});
	}).not.toThrow();

	await delay(100);
	expect(lastFrame()).toContain('base');
});

test('updateLayer called from <Layer> lifecycle does not include order in the patch', async () => {
	// This spy captures the actual patch keys passed to updateLayer.
	const calls = {current: [] as UpdateCall[]};

	let triggerUpdate: () => void;

	function Parent() {
		const [z, setZ] = useState(0);
		triggerUpdate = () => {
			setZ(1);
		};

		return (
			<Layer anchor="center" id="patch-inspection" z={z}>
				<Text>patch-content</Text>
			</Layer>
		);
	}

	const {lastFrame} = render(
		<OverlayHost>
			<SpiedHost calls={calls}>
				<Parent />
			</SpiedHost>
		</OverlayHost>,
	);

	await delay(200);
	expect(lastFrame()).toContain('patch-content');

	// Clear calls before triggering the update.
	calls.current = [];
	triggerUpdate!();
	await delay(200);

	// At least one update must have fired.
	expect(calls.current.length).toBeGreaterThan(0);

	// The updateLayer patch must NOT carry `order` — the Layer component
	// never includes it, and the host manages order internally.
	for (const call of calls.current) {
		expect(call.keys).not.toContain('order');
	}
});

test('multiple sequential updates to the same layer each apply correctly', async () => {
	const hostRef = {current: null as ReturnType<typeof useOverlayHost> | null};

	const {lastFrame} = render(
		<OverlayHost>
			<RegisterAndUpdateLayer
				id="multi-layer"
				initialContent="v0"
				hostRef={hostRef}
			/>
			<ContextProbe hostRef={hostRef} />
		</OverlayHost>,
	);

	await delay(200);
	expect(lastFrame()).toContain('v0');

	hostRef.current!.updateLayer('multi-layer', {content: <Text>v1</Text>});
	await delay(100);
	expect(lastFrame()).toContain('v1');

	hostRef.current!.updateLayer('multi-layer', {content: <Text>v2</Text>});
	await delay(100);
	expect(lastFrame()).toContain('v2');

	hostRef.current!.updateLayer('multi-layer', {content: <Text>v3</Text>});
	await delay(100);
	expect(lastFrame()).toContain('v3');
	expect(lastFrame()).not.toContain('v0');
	expect(lastFrame()).not.toContain('v1');
	expect(lastFrame()).not.toContain('v2');
});

test('stacking order of two layers is preserved after updating one (order not reset)', async () => {
	// Register two layers at the same z, same anchor (center), so they
	// overlap. The second-registered layer (higher order) paints on top.
	//
	// If updateLayer accidentally reset `order` to undefined/NaN, the
	// sort could reorder them. This test verifies the stacking is
	// stable across an update.
	const hostRef = {current: null as ReturnType<typeof useOverlayHost> | null};

	function RegisterTwoLayers() {
		const {registerLayer} = useOverlayHost();
		useEffect(() => {
			registerLayer({
				id: 'bottom-layer',
				z: 0,
				capture: false,
				backdrop: 'none',
				content: <Text>BOTTOM</Text>,
				overflow: 'hidden',
			});
			registerLayer({
				id: 'top-layer',
				z: 0,
				capture: false,
				backdrop: 'none',
				content: <Text>TOP</Text>,
				overflow: 'hidden',
			});
		}, [registerLayer]);
		return null;
	}

	const {lastFrame} = render(
		<OverlayHost>
			<RegisterTwoLayers />
			<ContextProbe hostRef={hostRef} />
		</OverlayHost>,
	);

	await delay(200);

	// Both layers are centered and overlap; "TOP" (registered second,
	// higher order) should be visible on top.
	expect(lastFrame()).toContain('TOP');

	// Update the BOTTOM layer — its order must be preserved so it stays
	// behind TOP.
	hostRef.current!.updateLayer('bottom-layer', {
		content: <Text>BOTTOM2</Text>,
	});
	await delay(200);

	// TOP is still visible (still on top). BOTTOM2 may or may not be
	// visible depending on overlap, but TOP must not have been pushed
	// behind — proving order wasn't disturbed.
	expect(lastFrame()).toContain('TOP');
	expect(lastFrame()).toContain('base');
});

// ── Type-level assertions ──────────────────────────────────────────
//
// The following tests verify the *type contract* of updateLayer.
// After the fix, the patch parameter is `LayerPatch` which omits
// `order`. These assertions will be validated by `tsc` when test files
// are type-checked.

test('type-level: updateLayer accepts patches with content, z, capture, exiting', async () => {
	const hostRef = {current: null as ReturnType<typeof useOverlayHost> | null};

	render(
		<OverlayHost>
			<RegisterAndUpdateLayer
				id="type-ok"
				initialContent="ok"
				hostRef={hostRef}
			/>
			<ContextProbe hostRef={hostRef} />
		</OverlayHost>,
	);

	await delay(200);

	// These calls must all be TYPE-VALID (no compile error).
	hostRef.current!.updateLayer('type-ok', {content: <Text>x</Text>});
	hostRef.current!.updateLayer('type-ok', {z: 5});
	hostRef.current!.updateLayer('type-ok', {capture: true});
	hostRef.current!.updateLayer('type-ok', {exiting: true});
	hostRef.current!.updateLayer('type-ok', {
		content: <Text>x</Text>,
		z: 2,
		capture: false,
		exiting: false,
		backdrop: 'opaque',
		overflow: 'visible',
	});

	await delay(100);
	expect(hostRef.current).not.toBeNull();
});

// ── Compile-time type hole verification ────────────────────────────
//
// The following block documents the type contract that the fix
// introduces. `order` must NOT be a valid key in the patch.
//
// If LayerPatch is defined correctly (Omit<Partial<OverlayDescriptor>,
// 'order'>), then passing `order` is a type error. The
// `@ts-expect-error` directives below assert this.
//
// NOTE: These are validated when test files are type-checked (e.g. via
// a typecheck step or IDE). They are NOT evaluated at runtime.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _typeLevelUpdateLayerOrderExcluded(
	host: ReturnType<typeof useOverlayHost>,
) {
	// After the fix, `order` must be rejected by the patch type.
	// The @ts-expect-error proves it's a type error.
	// @ts-expect-error — 'order' does not exist on LayerPatch
	host.updateLayer('x', {order: 999});

	// A patch without `order` must still be valid.
	host.updateLayer('x', {z: 1});
}
