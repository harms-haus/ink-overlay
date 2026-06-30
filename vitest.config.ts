import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
		setupFiles: ['./tests/setup.ts'],
		globals: false,
		// Many tests drive Ink's real render loop with real timers. Running
		// files in parallel starves the event loop on slower CI runners and
		// causes timer-based assertions to flake, so run sequentially.
		fileParallelism: false,
		env: {
			FORCE_COLOR: '1',
			// Ink (via `is-in-ci`) switches to a non-interactive render path when
			// CI is set, which changes output and breaks render tests. Force
			// interactive rendering so tests are deterministic in any environment.
			CI: '0',
		},
	},
});
