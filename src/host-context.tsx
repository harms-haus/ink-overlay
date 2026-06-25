import {createContext, useContext} from 'react';
import type {OverlayDescriptor, LayerPatch} from './types.js';

export type OverlayHostContextValue = {
	registerLayer: (descriptor: Omit<OverlayDescriptor, 'order'>) => void;
	unregisterLayer: (id: string) => void;
	updateLayer: (id: string, patch: LayerPatch) => void;
};

export const OverlayHostContext = createContext<OverlayHostContextValue | null>(
	null,
);

/**
 * Read the overlay host context.
 *
 * Must be called inside a `<Layer>` that is rendered within `<OverlayHost>`.
 *
 * @throws {Error} if rendered outside an `<OverlayHost>`.
 */
export function useOverlayHost(): OverlayHostContextValue {
	const value = useContext(OverlayHostContext);

	if (value === null) {
		throw new Error('<Layer> must be rendered inside <OverlayHost>.');
	}

	return value;
}
