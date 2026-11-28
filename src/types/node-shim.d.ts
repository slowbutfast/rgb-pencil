/**
 * Minimal Node type surface for the test-only fixture loader. The project does
 * not depend on `@types/node`; Vitest runs these imports in Node.
 */
declare module 'node:fs' {
  export function readFileSync(path: string | URL): Uint8Array;
}

declare module 'node:process' {
  const process: {
    stdout: { write(chunk: string): boolean };
  };
  export default process;
}
