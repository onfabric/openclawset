/**
 * Prompt guard — re-exports @inquirer/prompts functions with an interactive-mode check.
 *
 * By default, all prompts throw an error. Callers must opt in to interactive mode
 * via `setInteractive(true)` (triggered by the `--interactive` / `-i` CLI flag).
 * This prevents agents from hanging on prompts they cannot answer.
 */
import {
  checkbox as _checkbox,
  confirm as _confirm,
  input as _input,
  search as _search,
  select as _select,
} from '@inquirer/prompts';

let _interactive = false;

export function setInteractive(value: boolean): void {
  _interactive = value;
}

export function isInteractive(): boolean {
  return _interactive;
}

function assertInteractive(prompt: string): void {
  if (!_interactive) {
    throw new Error(
      `Cannot prompt in non-interactive mode: "${prompt}"\n` +
        'Provide the required value via CLI flags, or use --interactive / -i for prompts.',
    );
  }
}

function extractMessage(opts: unknown): string {
  if (typeof opts === 'object' && opts !== null && 'message' in opts) {
    return String((opts as { message: unknown }).message);
  }
  return 'prompt';
}

export const input: typeof _input = ((...args: Parameters<typeof _input>) => {
  assertInteractive(extractMessage(args[0]));
  return _input(...args);
}) as typeof _input;

export const select: typeof _select = ((...args: Parameters<typeof _select>) => {
  assertInteractive(extractMessage(args[0]));
  return _select(...args);
}) as typeof _select;

export const checkbox: typeof _checkbox = ((...args: Parameters<typeof _checkbox>) => {
  assertInteractive(extractMessage(args[0]));
  return _checkbox(...args);
}) as typeof _checkbox;

export const confirm: typeof _confirm = ((...args: Parameters<typeof _confirm>) => {
  assertInteractive(extractMessage(args[0]));
  return _confirm(...args);
}) as typeof _confirm;

export const search: typeof _search = ((...args: Parameters<typeof _search>) => {
  assertInteractive(extractMessage(args[0]));
  return _search(...args);
}) as typeof _search;
