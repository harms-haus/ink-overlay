// Make chalk initialise at basic 16-color ANSI (level 1) so Ink's rendered
// output is deterministic in every environment.
//
// chalk's `supports-color` detector returns level 3 (truecolor) whenever it
// sees the `GITHUB_ACTIONS` env var (always set on GitHub Actions runners),
// which makes hex colours like #1a1a2e emit `48;2;r;g;bm` instead of rounding
// to the basic `40m` escape the characterization tests pin against. With
// these CI-provider keys removed, the detector falls through to
// `return min` (= FORCE_COLOR, set to 1 in vitest.config.ts).
//
// Deleting here (rather than relying on FORCE_COLOR alone, or mutating
// chalk.level) is necessary because vitest can load multiple module
// instances of chalk, so mutating one singleton doesn't reach Ink's copy.
// Env vars are read at chalk's module-evaluation time, which happens when
// Ink is imported by the test files — after this setup file runs.
delete process.env.GITHUB_ACTIONS;
delete process.env.GITEA_ACTIONS;
delete process.env.CIRCLECI;
