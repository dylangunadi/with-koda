// Empty stand-in for the "server-only" package under Vitest (plain Node).
// The real package exists to make Next.js fail builds that pull server
// modules into client bundles; unit tests are server-side by definition.
export {};
