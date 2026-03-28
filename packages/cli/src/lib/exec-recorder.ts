import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecCall {
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type ExecFn = (
  args: string[],
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

// ---------------------------------------------------------------------------
// Recording — wraps a real exec and saves every call to a fixture file
// ---------------------------------------------------------------------------

export function recordingExec(realExec: ExecFn, calls: ExecCall[]): ExecFn {
  return async (args) => {
    const result = await realExec(args);
    calls.push({ args, ...result });
    return result;
  };
}

export async function saveRecording(calls: ExecCall[], path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(calls, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Replay — returns recorded responses matched by args
// ---------------------------------------------------------------------------

export async function loadRecording(path: string): Promise<ExecCall[]> {
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Create an exec function that replays recorded calls in order.
 * Each call is consumed once — calling with the same args twice
 * returns different results if they were recorded twice.
 */
export function replayExec(calls: ExecCall[]): ExecFn {
  const queue = [...calls];

  return async (args) => {
    const idx = queue.findIndex((c) => argsMatch(c.args, args));
    if (idx === -1) {
      throw new Error(
        `No recorded response for: openclaw ${args.join(' ')}\n` +
          `Remaining recordings: ${queue.map((c) => c.args.join(' ')).join('\n  ')}`,
      );
    }
    const [call] = queue.splice(idx, 1);
    return { stdout: call!.stdout, stderr: call!.stderr, exitCode: call!.exitCode };
  };
}

function argsMatch(recorded: string[], actual: string[]): boolean {
  if (recorded.length !== actual.length) return false;
  return recorded.every((v, i) => v === actual[i]);
}
