import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
		globals: false,
		env: {
			FORCE_COLOR: '1',
			// Ink (via `is-in-ci`) switches to a non-interactive render path when
			// CI is set, which changes output and breaks render tests. Force
			// interactive rendering so tests are deterministic in any environment.
			CI: '0',
		},
	},
});
