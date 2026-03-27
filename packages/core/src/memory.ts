/**
 * Memory utilities for managing dress-owned sections in daily memory files.
 *
 * Sections are delimited by HTML comments invisible to the agent:
 *   <!-- clawset:<dress-id>:start -->
 *   ## Section Name
 *   Content...
 *   <!-- clawset:<dress-id>:end -->
 */

const START_TAG = (dressId: string) => `<!-- clawset:${dressId}:start -->`;
const END_TAG = (dressId: string) => `<!-- clawset:${dressId}:end -->`;

const SECTION_REGEX = (dressId: string) =>
  new RegExp(
    `${escapeRegex(START_TAG(dressId))}\\n([\\s\\S]*?)${escapeRegex(END_TAG(dressId))}`,
    'g',
  );

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Wrap content in clawset ownership markers.
 */
export function wrapSection(dressId: string, content: string): string {
  return `${START_TAG(dressId)}\n${content}\n${END_TAG(dressId)}`;
}

/**
 * Extract all sections owned by a dress from a memory file.
 */
export function extractSections(
  dressId: string,
  fileContent: string,
): string[] {
  const regex = SECTION_REGEX(dressId);
  const sections: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(fileContent)) !== null) {
    sections.push(match[1].trim());
  }
  return sections;
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
 * List all dress IDs that have markers in a memory file.
 */
export function findDressMarkers(fileContent: string): string[] {
  const regex = /<!-- clawset:([a-z][a-z0-9-]*):start -->/g;
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(fileContent)) !== null) {
    ids.add(match[1]);
  }
  return [...ids];
}

/**
 * Build initial memory section scaffolding for a dress.
 */
export function buildMemoryScaffold(
  dressId: string,
  sections: string[],
): string {
  if (sections.length === 0) return '';
  const content = sections.map((s) => `## ${s}\n`).join('\n');
  return wrapSection(dressId, content);
}
