/**
 * Registry-driven demo pattern.
 *
 * Each scene is a self-contained component that manages its own state and lifecycle.
 * Only one scene is mounted at any given time; the rest are unmounted so they do
 * not interfere with one another. Pressing Esc returns to the menu (handled in the
 * app root), which unmounts the active scene and shows the registry list again.
 */
import {type ComponentType} from 'react';

/** A single demo scene entry in the registry. */
export type SceneDefinition = {
	/** Stable kebab-case id used as React key and for routing. */
	id: string;
	/** Human-readable title shown in the menu. */
	title: string;
	/** Short description shown in the menu under the title. */
	description: string;
	/** Tags for quick scanning (e.g. ['Layer', 'Anchor']). */
	tags: string[];
	/**
	 * The scene component. Receives no props — scenes manage their own state and
	 * return to the menu via Esc handled in the app root.
	 */
	component: ComponentType;
};
