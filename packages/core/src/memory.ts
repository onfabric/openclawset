/**
 * Memory utilities for managing dress-owned sections in daily memory files.
 *
 * Sections are delimited by HTML comments invisible to the agent:
 *   <!-- clawtique:<dress-id>:start -->
 *   ## Section Name
 *   Content...
 *   <!-- clawtique:<dress-id>:end -->
 */

const START_TAG = (dressId: string) => `<!-- clawtique:${dressId}:start -->`;
const END_TAG = (dressId: string) => `<!-- clawtique:${dressId}:end -->`;

const SECTION_REGEX = (dressId: string) =>
  new RegExp(
    `${escapeRegex(START_TAG(dressId))}\\n([\\s\\S]*?)${escapeRegex(END_TAG(dressId))}`,
    'g',
  );

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Wrap content in clawtique ownership markers.
 */
export function wrapSection(dressId: string, content: string): string {
  return `${START_TAG(dressId)}\n${content}\n${END_TAG(dressId)}`;
}

/**
 * Extract all sections owned by a dress from a memory file.
 */
export function extractSections(dressId: string, fileContent: string): string[] {
  return [...fileContent.matchAll(SECTION_REGEX(dressId))].map((m) => m[1]!.trim());
}

/**
 * Strip ownership markers from a memory file, leaving the content intact.
 * Used when undressing — data persists, markers are removed.
 */
export function stripMarkers(dressId: string, fileContent: string): string {
  return fileContent
    .replace(new RegExp(`${escapeRegex(START_TAG(dressId))}\\n?`, 'g'), '')
    .replace(new RegExp(`\\n?${escapeRegex(END_TAG(dressId))}`, 'g'), '');
}

/**
 * Remove a dress-owned section entirely — markers AND content.
 * Used for heartbeat rules and other config that should disappear on undress.
 */
export function removeSection(dressId: string, fileContent: string): string {
  return `${fileContent
    .replace(
      new RegExp(
        `\\n*${escapeRegex(START_TAG(dressId))}\\n[\\s\\S]*?${escapeRegex(END_TAG(dressId))}\\n?`,
        'g',
      ),
      '',
    )
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
}

/**
 * List all dress IDs that have markers in a memory file.
 */
export function findDressMarkers(fileContent: string): string[] {
  const matches = fileContent.matchAll(/<!-- clawtique:([a-z][a-z0-9-]*):start -->/g);
  return [...new Set([...matches].map((m) => m[1]!))];
}

/**
 * Build initial memory section scaffolding for a dress.
 */
export function buildMemoryScaffold(dressId: string, sections: string[]): string {
  if (sections.length === 0) return '';
  const content = sections.map((s) => `## ${s}\n`).join('\n');
  return wrapSection(dressId, content);
}
