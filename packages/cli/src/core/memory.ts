/**
 * Memory utilities for managing dress-owned sections in files.
 *
 * Sections are delimited by HTML comments invisible to the agent:
 *   <!-- clawtique:<dress-id>:start -->
 *   ## Section Name
 *   Content...
 *   <!-- clawtique:<dress-id>:end -->
 */

const START_TAG = (dressId: string) => `<!-- clawtique:${dressId}:start -->`;
const END_TAG = (dressId: string) => `<!-- clawtique:${dressId}:end -->`;

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
