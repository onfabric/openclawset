import type { ResolvedDress } from '#core/schema.ts';

/**
 * Generate a DRESSCODE.md from a resolved dress definition.
 *
 * This is the "glue" document that explains how a dress's pieces fit together.
 * It lives at ~/.openclaw/workspace/dresses/<id>/DRESSCODE.md and is referenced from
 * DRESSES.md so the agent knows about active dress configurations.
 */
export function generateDresscode(dress: ResolvedDress): string {
  const lines: string[] = [];

  lines.push(`# ${dress.name}`);
  lines.push('');
  if (dress.description) {
    lines.push(dress.description);
    lines.push('');
  }

  // Skills
  if (dress.requires.skills.length > 0) {
    lines.push('## Skills');
    lines.push('');
    for (const skill of dress.requires.skills) {
      lines.push(`- **${skill}** — \`~/.openclaw/skills/${skill}/SKILL.md\``);
    }
    lines.push('');
  }

  // Crons → skill bindings
  if (dress.crons.length > 0) {
    lines.push('## Crons');
    lines.push('');
    for (const cron of dress.crons) {
      lines.push(`- **${cron.name}** (\`${cron.schedule}\`) → skill: **${cron.skill}**`);
    }
    lines.push('');
  }

  // Memory
  if (dress.memory.dailySections.length > 0 || dress.memory.reads.length > 0) {
    lines.push('## Memory');
    lines.push('');
    for (const section of dress.memory.dailySections) {
      lines.push(`- Owns section: **## ${section}** in daily notes`);
    }
    for (const read of dress.memory.reads) {
      lines.push(`- Reads: **## ${read}**`);
    }
    lines.push('');
  }

  // Heartbeat
  if (dress.heartbeat.length > 0) {
    lines.push('## Heartbeat');
    lines.push('');
    for (const entry of dress.heartbeat) {
      lines.push(`- ${entry}`);
    }
    lines.push('');
  }

  // Plugins
  if (dress.requires.plugins.length > 0) {
    lines.push('## Plugins');
    lines.push('');
    for (const plugin of dress.requires.plugins) {
      lines.push(`- **${plugin.id}** (\`${plugin.spec}\`)`);
    }
    lines.push('');
  }

  // Workspace files
  const workspacePaths = Object.keys(dress.workspace);
  if (workspacePaths.length > 0) {
    lines.push('## Workspace');
    lines.push('');
    for (const path of workspacePaths) {
      lines.push(`- \`~/.openclaw/workspace/${path}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}
