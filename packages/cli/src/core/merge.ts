import { DependencyGraph } from '#core/graph.ts';
import type { CronDef, PluginDef, ResolvedDress } from '#core/schema.ts';

// ---------------------------------------------------------------------------
// Conflict types
// ---------------------------------------------------------------------------

export interface MergeConflict {
  type: 'memory-section' | 'cron-id' | 'secret-key' | 'cron-missing-skill';
  key: string;
  dresses: [string, string];
  message: string;
}

// ---------------------------------------------------------------------------
// Desired state — the merged result of all active dresses
// ---------------------------------------------------------------------------

export interface DesiredState {
  plugins: Map<string, PluginDef>;
  skills: Set<string>;
  crons: Map<string, CronDef & { dressId: string }>;
  memorySections: Map<string, string>; // section name → dress id
  secrets: Map<string, { dressId: string; description: string; url?: string }>;
}

// ---------------------------------------------------------------------------
// Merge all active dresses into a desired state
// ---------------------------------------------------------------------------

export function mergeDresses(dresses: Map<string, ResolvedDress>): {
  state: DesiredState;
  conflicts: MergeConflict[];
} {
  const conflicts: MergeConflict[] = [];

  const state: DesiredState = {
    plugins: new Map(),
    skills: new Set(),
    crons: new Map(),
    memorySections: new Map(),
    secrets: new Map(),
  };

  // Build dependency graph and sort
  const graph = new DependencyGraph();
  for (const [id, dress] of dresses) {
    graph.addNode(id);
    for (const depId of Object.keys(dress.requires.dresses)) {
      if (dresses.has(depId)) {
        graph.addDependency(id, depId);
      }
    }
  }

  const order = graph.sort();

  for (const dressId of order) {
    const dress = dresses.get(dressId);
    if (!dress) continue;

    // Plugins — keyed by id, first definition wins
    for (const plugin of dress.requires.plugins) {
      if (!state.plugins.has(plugin.id)) {
        state.plugins.set(plugin.id, plugin);
      }
    }

    // Skills — set union, no conflicts possible
    for (const skill of dress.requires.skills) {
      state.skills.add(skill);
    }

    // Crons — namespaced by dress id, fail on duplicate
    const dressSkills = new Set(dress.requires.skills);
    for (const cron of dress.crons) {
      // Every cron must reference a skill declared in requires.skills
      if (!dressSkills.has(cron.skill)) {
        conflicts.push({
          type: 'cron-missing-skill',
          key: `${dressId}:${cron.id}`,
          dresses: [dressId, dressId],
          message: `Cron "${cron.id}" in "${dressId}" references skill "${cron.skill}" which is not in requires.skills`,
        });
      }

      const qualifiedId = `${dressId}:${cron.id}`;
      if (state.crons.has(qualifiedId)) {
        conflicts.push({
          type: 'cron-id',
          key: qualifiedId,
          dresses: [state.crons.get(qualifiedId)!.dressId, dressId],
          message: `Cron "${cron.id}" is defined by both "${state.crons.get(qualifiedId)!.dressId}" and "${dressId}"`,
        });
      } else {
        state.crons.set(qualifiedId, { ...cron, dressId });
      }
    }

    // Memory sections — fail on conflict
    for (const section of dress.memory.dailySections) {
      if (state.memorySections.has(section)) {
        const existingDress = state.memorySections.get(section)!;
        conflicts.push({
          type: 'memory-section',
          key: section,
          dresses: [existingDress, dressId],
          message: `Memory section "${section}" is claimed by both "${existingDress}" and "${dressId}"`,
        });
      } else {
        state.memorySections.set(section, dressId);
      }
    }

    // Secrets — fail if same key with different description
    for (const [key, secret] of Object.entries(dress.secrets)) {
      const existing = state.secrets.get(key);
      if (existing && existing.description !== secret.description) {
        conflicts.push({
          type: 'secret-key',
          key,
          dresses: [existing.dressId, dressId],
          message: `Secret "${key}" is defined differently by "${existing.dressId}" and "${dressId}"`,
        });
      } else if (!existing) {
        state.secrets.set(key, { dressId, ...secret });
      }
    }
  }

  return { state, conflicts };
}

// ---------------------------------------------------------------------------
// Diff — compute what needs to change from current to desired
// ---------------------------------------------------------------------------

export interface StateDiff {
  cronsToAdd: Array<CronDef & { dressId: string }>;
  cronsToRemove: string[];
  pluginsToAdd: PluginDef[];
  pluginsToRemove: string[];
  skillsToAdd: string[];
  skillsToRemove: string[];
}

export function diffState(
  current: {
    crons: Set<string>;
    plugins: Set<string>;
    skills: Set<string>;
  },
  desired: DesiredState,
): StateDiff {
  const desiredCronIds = new Set(desired.crons.keys());
  const desiredPluginIds = new Set(desired.plugins.keys());
  const desiredSkills = desired.skills;

  return {
    cronsToAdd: [...desired.crons.entries()]
      .filter(([id]) => !current.crons.has(id))
      .map(([, cron]) => cron),
    cronsToRemove: [...current.crons].filter((id) => !desiredCronIds.has(id)),
    pluginsToAdd: [...desired.plugins.values()].filter((p) => !current.plugins.has(p.id)),
    pluginsToRemove: [...current.plugins].filter((p) => !desiredPluginIds.has(p)),
    skillsToAdd: [...desiredSkills].filter((s) => !current.skills.has(s)),
    skillsToRemove: [...current.skills].filter((s) => !desiredSkills.has(s)),
  };
}
