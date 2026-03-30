/**
 * Ensure the agent's AGENTS.md contains a reference to DRESSES.md.
 *
 * Uses HTML comment markers (consistent with memory.ts) so the section
 * is idempotent — calling this multiple times is safe.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const MARKER_START = '<!-- clawtique:dresses:start -->';
const MARKER_END = '<!-- clawtique:dresses:end -->';

const DRESSES_SECTION = `
${MARKER_START}
## Dresses

Read \`DRESSES.md\` at the start of every session. It lists your active dresses,
their DRESSCODEs, and skill routing. Follow it strictly.
${MARKER_END}
`;

/**
 * Append the DRESSES.md reference to AGENTS.md if not already present.
 *
 * @param workspaceDir - The openclaw workspace directory (e.g. ~/.openclaw/workspace)
 */
export async function ensureDressesReference(workspaceDir: string): Promise<void> {
  const agentsPath = join(workspaceDir, 'AGENTS.md');

  if (!existsSync(agentsPath)) return;

  const content = await readFile(agentsPath, 'utf-8');

  if (content.includes(MARKER_START)) return;

  await writeFile(agentsPath, `${content.trimEnd()}\n${DRESSES_SECTION}`);
}
