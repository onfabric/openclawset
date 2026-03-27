import { describe, test, expect } from 'bun:test';
import { mergeDresses, diffState, type DesiredState } from '../src/merge.js';
import type { ResolvedDress } from '../src/schema.js';

function makeDress(overrides: Partial<ResolvedDress> & { id: string }): ResolvedDress {
  return {
    name: overrides.id,
    version: '1.0.0',
    description: '',
    requires: { plugins: [], skills: [], dresses: {}, optionalDresses: {} },
    secrets: {},
    crons: [],
    memory: { dailySections: [], reads: [] },
    heartbeat: [],
    files: { skills: {}, templates: [] },
    ...overrides,
  };
}

describe('mergeDresses', () => {
  test('single dress merges cleanly', () => {
    const dresses = new Map<string, ResolvedDress>();
    dresses.set('fitness', makeDress({
      id: 'fitness',
      crons: [{ id: 'workout', name: 'Workout', schedule: '0 8 * * *', skill: 'workout-planner' }],
      memory: { dailySections: ['Fitness'], reads: [] },
      requires: { plugins: [], skills: ['workout-planner'], dresses: {}, optionalDresses: {} },
    }));

    const { state, conflicts } = mergeDresses(dresses);
    expect(conflicts).toHaveLength(0);
    expect(state.crons.size).toBe(1);
    expect(state.crons.has('fitness:workout')).toBe(true);
    expect(state.skills.has('workout-planner')).toBe(true);
    expect(state.memorySections.get('Fitness')).toBe('fitness');
  });

  test('two dresses with no overlap merge cleanly', () => {
    const dresses = new Map<string, ResolvedDress>();
    dresses.set('fitness', makeDress({
      id: 'fitness',
      memory: { dailySections: ['Fitness'], reads: [] },
    }));
    dresses.set('reading', makeDress({
      id: 'reading',
      memory: { dailySections: ['Reading'], reads: [] },
    }));

    const { conflicts } = mergeDresses(dresses);
    expect(conflicts).toHaveLength(0);
  });

  test('conflicting memory sections produce a conflict', () => {
    const dresses = new Map<string, ResolvedDress>();
    dresses.set('a', makeDress({
      id: 'a',
      memory: { dailySections: ['Health'], reads: [] },
    }));
    dresses.set('b', makeDress({
      id: 'b',
      memory: { dailySections: ['Health'], reads: [] },
    }));

    const { conflicts } = mergeDresses(dresses);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('memory-section');
  });

  test('shared skills/plugins are unioned without conflict', () => {
    const dresses = new Map<string, ResolvedDress>();
    dresses.set('a', makeDress({
      id: 'a',
      requires: { plugins: [{ id: 'telegram', spec: 'telegram' }], skills: ['oura'], dresses: {}, optionalDresses: {} },
    }));
    dresses.set('b', makeDress({
      id: 'b',
      requires: { plugins: [{ id: 'telegram', spec: 'telegram' }], skills: ['reading-list'], dresses: {}, optionalDresses: {} },
    }));

    const { state, conflicts } = mergeDresses(dresses);
    expect(conflicts).toHaveLength(0);
    expect(state.plugins.size).toBe(1); // telegram deduplicated
    expect(state.skills.size).toBe(2);
  });

  test('cron referencing undeclared skill produces conflict', () => {
    const dresses = new Map<string, ResolvedDress>();
    dresses.set('broken', makeDress({
      id: 'broken',
      crons: [{ id: 'task', name: 'Task', schedule: '0 8 * * *', skill: 'nonexistent' }],
      requires: { plugins: [], skills: [], dresses: {}, optionalDresses: {} },
    }));

    const { conflicts } = mergeDresses(dresses);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('cron-missing-skill');
  });

  test('cron referencing declared skill passes', () => {
    const dresses = new Map<string, ResolvedDress>();
    dresses.set('valid', makeDress({
      id: 'valid',
      crons: [{ id: 'task', name: 'Task', schedule: '0 8 * * *', skill: 'my-skill' }],
      requires: { plugins: [], skills: ['my-skill'], dresses: {}, optionalDresses: {} },
    }));

    const { conflicts } = mergeDresses(dresses);
    expect(conflicts).toHaveLength(0);
  });
});

describe('diffState', () => {
  test('detects new crons to add', () => {
    const current = { crons: new Set<string>(), plugins: new Set<string>(), skills: new Set<string>() };
    const desired: DesiredState = {
      crons: new Map([['fitness:workout', { id: 'workout', name: 'Workout', schedule: '0 8 * * *', skill: 'workout-planner', dressId: 'fitness' }]]),
      plugins: new Map(),
      skills: new Set(['workout-planner']),
      memorySections: new Map(),
      heartbeatEntries: new Map(),
      secrets: new Map(),
    };

    const diff = diffState(current, desired);
    expect(diff.cronsToAdd).toHaveLength(1);
    expect(diff.cronsToAdd[0].name).toBe('Workout');
    expect(diff.skillsToAdd).toEqual(['workout-planner']);
    expect(diff.cronsToRemove).toHaveLength(0);
  });

  test('detects crons to remove', () => {
    const current = {
      crons: new Set(['fitness:workout', 'fitness:feedback']),
      plugins: new Set<string>(),
      skills: new Set<string>(),
    };
    const desired: DesiredState = {
      crons: new Map(),
      plugins: new Map(),
      skills: new Set(),
      memorySections: new Map(),
      heartbeatEntries: new Map(),
      secrets: new Map(),
    };

    const diff = diffState(current, desired);
    expect(diff.cronsToRemove.sort()).toEqual(['fitness:feedback', 'fitness:workout']);
    expect(diff.cronsToAdd).toHaveLength(0);
  });
});
