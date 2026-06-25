import {describe, test, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const indexSource = readFileSync(
	resolve(repoRoot, 'src/index.tsx'),
	'utf8',
);
const apiReference = readFileSync(
	resolve(repoRoot, 'docs/reference/api-reference.md'),
	'utf8',
);

/**
 * Extract the names of the shared domain types that the barrel re-exports
 * from `./types.js`. The API reference's intro states that it "documents
 * every exported type alias" with signatures "reproduced verbatim from
 * src/types.ts" — so each of these exported type names must appear as a
 * documented section heading in the reference.
 */
function exportedSharedTypes(): string[] {
	const blockMatch = indexSource.match(
		/export type \{([^}]*)\} from '\.\/types\.js';/s,
	);
	expect(blockMatch, 'expected a `export type {…} from "./types.js"` block').toBeTruthy();
	const names = (blockMatch![1])
		.split(',')
		.map(name => name.trim())
		.filter(name => name.length > 0);
	// Sanity: the block is non-empty and contains known anchors.
	expect(names).toContain('Anchor');
	expect(names).toContain('OverlayDescriptor');
	return names;
}

describe('API reference documents every exported shared type', () => {
	const names = exportedSharedTypes();

	for (const name of names) {
		test(`### \`${name}\` section exists in api-reference.md`, () => {
			// A documented type appears either as its own heading
			// (`### \`TypeName\``) or as part of a combined heading
			// (e.g. `### \`TransitionStep\` and \`TransitionConfig\``).
			const headingPattern = new RegExp(
				`^### .*\\\`${name}\\\``,
				'm',
			);
			const inReference = headingPattern.test(apiReference);
			expect(inReference, `Type \`${name}\` is exported from the barrel but has no section heading in docs/reference/api-reference.md`).toBe(true);
		});
	}

	test('the exported shared type list is non-empty', () => {
		expect(names.length).toBeGreaterThan(0);
	});

	test('LayerPatch is exported and therefore must be documented', () => {
		// Regression guard for the specific finding that LayerPatch was
		// added without a corresponding API-reference entry.
		expect(names).toContain('LayerPatch');
		const headingPattern = /^### .*`LayerPatch`/m;
		expect(headingPattern.test(apiReference)).toBe(true);
	});
});
