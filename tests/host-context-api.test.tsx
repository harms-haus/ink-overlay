/**
 * Characterization tests for the OverlayHostContext API surface.
 *
 * The architecture documentation (`docs/concepts/architecture.md`, "The
 * Registration Pattern" section) explicitly enumerates the four methods
 * that `OverlayHostContext` exposes. These tests pin down that exact
 * method set at runtime so that a future rename (e.g. the historical
 * `onLayerExited` → `removeLayerAfterExit` rename) cannot silently make
 * the docs inaccurate again.
 *
 * If any of these names change, BOTH this test and the documentation
 * must be updated together.
 */
import {test, expect} from 'vitest';
import React from 'react';
import {Text} from 'ink';
import {OverlayHost} from '../src/host.js';
import {OverlayHostContext} from '../src/host-context.js';
import {renderWithHost} from './helpers/render-with-host.js';

function Probe({
	onContext,
}: {
	onContext: (value: unknown) => void;
}) {
	return (
		<OverlayHostContext.Consumer>
			{value => {
				onContext(value);
				return <Text>x</Text>;
			}}
		</OverlayHostContext.Consumer>
	);
}

test('OverlayHostContext value exposes exactly the four documented methods', () => {
	let captured: unknown = null;
	renderWithHost(
		<Probe onContext={v => {
			captured = v;
		}} />,
	);

	expect(captured).not.toBeNull();
	expect(typeof captured).toBe('object');

	const methods = Object.keys(captured as object).sort();
	expect(methods).toEqual(
		['registerLayer', 'removeLayerAfterExit', 'unregisterLayer', 'updateLayer'],
	);
});

test('the deprecated onLayerExited method name is NOT present on the context', () => {
	let captured: Record<string, unknown> | null = null;
	renderWithHost(
		<Probe onContext={v => {
			captured = v as Record<string, unknown>;
		}} />,
	);

	expect(captured).not.toBeNull();
	expect(captured).not.toHaveProperty('onLayerExited');
});

test('removeLayerAfterExit is a function on the context value', () => {
	let captured: Record<string, unknown> | null = null;
	renderWithHost(
		<Probe onContext={v => {
			captured = v as Record<string, unknown>;
		}} />,
	);

	expect(typeof captured!.removeLayerAfterExit).toBe('function');
});
