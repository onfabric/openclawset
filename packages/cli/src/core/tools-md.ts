/**
 * Manage lingerie-owned sections in the agent's TOOLS.md.
 *
 * Each lingerie that declares a `toolsSection` gets its content injected
 * into TOOLS.md with ownership markers. On removal the section is stripped.
 *
 * Markers follow the same pattern as memory.ts / agents-md.ts:
 *   <!-- clawtique:lingerie:<id>:start -->
 *   content…
 *   <!-- clawtique:lingerie:<id>:end -->
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const markerStart = (id: string) => `<!-- clawtique:lingerie:${id}:start -->`;
const markerEnd = (id: string) => `<!-- clawtique:lingerie:${id}:end -->`;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Append a lingerie's tools section to TOOLS.md (idempotent).
 */
export async function injectToolsSection(
  workspaceDir: string,
  lingerieId: string,
  content: string,
): Promise<void> {
  const toolsPath = join(workspaceDir, 'TOOLS.md');
  if (!existsSync(toolsPath)) return;

  let file = await readFile(toolsPath, 'utf-8');

  // Already present — replace in place
  const start = markerStart(lingerieId);
  const end = markerEnd(lingerieId);

  if (file.includes(start)) {
    file = stripSection(file, lingerieId);
  }

  const section = `\n${start}\n${content.trim()}\n${end}\n`;
  await writeFile(toolsPath, `${file.trimEnd()}\n${section}`);
}

/**
 * Remove a lingerie's tools section from TOOLS.md.
 */
export async function removeToolsSection(workspaceDir: string, lingerieId: string): Promise<void> {
  const toolsPath = join(workspaceDir, 'TOOLS.md');
  if (!existsSync(toolsPath)) return;

  const file = await readFile(toolsPath, 'utf-8');
  if (!file.includes(markerStart(lingerieId))) return;

  await writeFile(toolsPath, stripSection(file, lingerieId));
}

function stripSection(content: string, lingerieId: string): string {
  return content
    .replace(
      new RegExp(
        `\\n*${escapeRegex(markerStart(lingerieId))}\\n[\\s\\S]*?${escapeRegex(markerEnd(lingerieId))}\\n?`,
        'g',
      ),
      '',
    )
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
    .concat('\n');
}
