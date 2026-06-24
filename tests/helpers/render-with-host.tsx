/**
 * Test helper: wraps ink-testing-library's render() inside an
 * <OverlayHost> so that <Layer> and other context-dependent
 * components work out of the box.
 */
import type {ReactElement} from 'react';
import {render} from 'ink-testing-library';
import {OverlayHost} from '../../src/host.js';

export type RenderWithHostResult = {
	lastFrame: () => string;
	frames: string[];
	rerender: (tree: ReactElement) => void;
	unmount: () => void;
	stdin: {write: (input: string) => void; setRawMode: (mode: boolean) => void};
	stdout: {toString: () => string};
	cleanup: () => void;
};

/**
 * Render `tree` inside an <OverlayHost> and return the ink-testing-library
 * result shape.
 */
export function renderWithHost(
	tree: ReactElement,
	hostProperties?: Parameters<typeof OverlayHost>[0],
): RenderWithHostResult {
	return render(<OverlayHost {...hostProperties}>{tree}</OverlayHost>);
}
