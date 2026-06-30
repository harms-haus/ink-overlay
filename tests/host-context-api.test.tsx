/**
 * Characterization tests for the OverlayHostContext API surface.
 *
 * The architecture documentation (`docs/concepts/architecture.md`, "The
 * Registration Pattern" section) enumerates the methods that
 * `OverlayHostContext` exposes. These tests pin down that exact method
 * set at runtime so that a future rename or accidental re-addition of
 * a removed alias (e.g. the historical `removeLayerAfterExit` alias
 * that simply delegated to `unregisterLayer`) cannot silently make the
 * docs inaccurate.
 *
 * The context now exposes exactly THREE methods:
 * `registerLayer`, `unregisterLayer`, and `updateLayer`. The former
 * `removeLayerAfterExit` alias was removed; `LayerRenderer` calls
 * `unregisterLayer` directly.
 *
 * If any of these names change, BOTH this test and the documentation
 * must be updated together.
 */
import {test, expect, afterEach} from 'vitest';
import React from 'react';
import {Text} from 'ink';
import {OverlayHostContext} from '../src/host-context.js';
import {renderWithHost} from './helpers/render-with-host.js';

// Tracks the rendered instance so it is always torn down between tests.
let unmountInstance: (() => void) | undefined;

afterEach(() => {
	unmountInstance?.();
	unmountInstance = undefined;
});

function Probe({onContext}: {onContext: (value: unknown) => void}) {
	return (
		<OverlayHostContext.Consumer>
			{value => {
				onContext(value);
				return <Text>x</Text>;
			}}
		</OverlayHostContext.Consumer>
	);
}

test('OverlayHostContext value exposes exactly the three documented methods', () => {
	let captured: unknown = null;
	const {unmount} = renderWithHost(
		<Probe
			onContext={v => {
				captured = v;
			}}
		/>,
	);
	unmountInstance = unmount;

	expect(captured).not.toBeNull();
	expect(typeof captured).toBe('object');

	const methods = Object.keys(captured as object).sort();
	expect(methods).toEqual(['registerLayer', 'unregisterLayer', 'updateLayer']);
});

test('the deprecated onLayerExited method name is NOT present on the context', () => {
	let captured: Record<string, unknown> | null = null;
	const {unmount} = renderWithHost(
		<Probe
			onContext={v => {
				captured = v as Record<string, unknown>;
			}}
		/>,
	);
	unmountInstance = unmount;

	expect(captured).not.toBeNull();
	expect(captured).not.toHaveProperty('onLayerExited');
});

test('the removed removeLayerAfterExit alias is NOT present on the context', () => {
	let captured: Record<string, unknown> | null = null;
	const {unmount} = renderWithHost(
		<Probe
			onContext={v => {
				captured = v as Record<string, unknown>;
			}}
		/>,
	);
	unmountInstance = unmount;

	// The alias was removed; consumers must call unregisterLayer directly.
	expect(captured).not.toHaveProperty('removeLayerAfterExit');
});
