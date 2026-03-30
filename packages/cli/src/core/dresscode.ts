import type { ResolvedDress } from '#core/schema.ts';
import type { SkillTrigger } from '#core/schemas/index.ts';

/**
 * Generate a DRESSCODE.md from a resolved dress definition.
 *
 * This is the "glue" document that explains how a dress's pieces fit together.
 * It lives at ~/.openclaw/workspace/dresses/<id>/DRESSCODE.md and is referenced from
 * DRESSES.md so the agent knows about active dress configurations.
 */
export function generateDresscode(
  dress: ResolvedDress,
  skillTriggers: Record<string, SkillTrigger>,
): string {
  const lines: string[] = [];

  lines.push(`# ${dress.name}`);
  lines.push('');
  if (dress.description) {
    lines.push(dress.description);
    lines.push('');
  }

  // Group skills by trigger type
  const cronSkills: [string, SkillTrigger & { type: 'cron' }][] = [];
  const userSkills: [string, SkillTrigger & { type: 'user' }][] = [];
  const heartbeatSkills: [string, SkillTrigger & { type: 'heartbeat' }][] = [];

  for (const skill of dress.requires.skills) {
    const trigger = skillTriggers[skill];
    if (!trigger) continue;
    if (trigger.type === 'cron') cronSkills.push([skill, trigger]);
    else if (trigger.type === 'user') userSkills.push([skill, trigger]);
    else if (trigger.type === 'heartbeat') heartbeatSkills.push([skill, trigger]);
  }

  // Cron skills — show schedule binding
  if (cronSkills.length > 0) {
    lines.push('## Cron Skills');
    lines.push('');
    for (const [skillId, trigger] of cronSkills) {
      const cron = dress.crons.find((c) => c.id === trigger.cronId);
      const schedule = cron ? ` (\`${cron.schedule}\`)` : '';
      const cronName = cron ? `**${cron.name}**${schedule} → ` : '';
      lines.push(`- ${cronName}\`~/.openclaw/skills/${skillId}/SKILL.md\``);
    }
    lines.push('');
  }

  // User skills — show description for routing
  if (userSkills.length > 0) {
    lines.push('## User Skills');
    lines.push('');
    lines.push(
      "When the user's request matches one of these, read the skill file and follow its instructions.",
    );
    lines.push('');
    for (const [skillId, trigger] of userSkills) {
      lines.push(`- **${skillId}** — ${trigger.description}`);
      lines.push(`  → \`~/.openclaw/skills/${skillId}/SKILL.md\``);
    }
    lines.push('');
  }

  // Heartbeat skills — proactive behaviors
  if (heartbeatSkills.length > 0) {
    lines.push('## Heartbeat Skills');
    lines.push('');
    lines.push('Proactive behaviors to follow between scheduled tasks.');
    lines.push('');
    for (const [skillId, trigger] of heartbeatSkills) {
      lines.push(`- **${skillId}** — ${trigger.description}`);
      lines.push(`  → \`~/.openclaw/skills/${skillId}/SKILL.md\``);
    }
    lines.push('');
  }

  // Daily memory section
  if (dress.dailyMemorySection) {
    lines.push('## Daily Memory');
    lines.push('');
    lines.push(`- Owns section: **## ${dress.dailyMemorySection}** in daily memory`);
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
  if (dress.workspace.length > 0) {
    lines.push('## Workspace');
    lines.push('');
    for (const path of dress.workspace) {
      lines.push(`- \`~/.openclaw/workspace/${path}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}
