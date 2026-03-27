import { describe, test, expect } from 'bun:test';
import { generateDresscode } from '../src/dresscode.js';
import type { ResolvedDress } from '../src/schema.js';

describe('generateDresscode', () => {
  test('generates DRESSCODE with all sections', () => {
    const dress: ResolvedDress = {
      id: 'fitness-coach',
      name: 'Fitness Coach',
      version: '2.0.0',
      description: 'Sends workout schedule and collects post-training feedback.',
      requires: {
        plugins: [{ id: 'telegram', spec: 'telegram' }],
        skills: ['workout-schedule', 'workout-feedback'],
        dresses: {},
        optionalDresses: {},
      },
      secrets: {},
      crons: [
        { id: 'workout-schedule', name: 'Daily workout schedule', schedule: '30 21 * * 1,2,3,4,5', skill: 'workout-schedule' },
        { id: 'workout-feedback', name: 'Post-workout check-in', schedule: '30 23 * * 1,2,3,4,5', skill: 'workout-feedback' },
      ],
      memory: { dailySections: ['Fitness'], reads: [] },
      heartbeat: ['If near workout time and no schedule sent, nudge via Telegram.'],
      files: { skills: {}, templates: [] },
      workspace: {},
    };

    const result = generateDresscode(dress);

    expect(result).toContain('# Fitness Coach');
    expect(result).toContain('Sends workout schedule');
    expect(result).toContain('## Skills');
    expect(result).toContain('**workout-schedule**');
    expect(result).toContain('## Crons');
    expect(result).toContain('skill: **workout-schedule**');
    expect(result).toContain('## Memory');
    expect(result).toContain('## Fitness');
    expect(result).toContain('## Heartbeat');
    expect(result).toContain('## Plugins');
    expect(result).toContain('telegram');
  });

  test('omits empty sections', () => {
    const dress: ResolvedDress = {
      id: 'minimal',
      name: 'Minimal',
      version: '1.0.0',
      description: '',
      requires: { plugins: [], skills: ['my-skill'], dresses: {}, optionalDresses: {} },
      secrets: {},
      crons: [{ id: 'task', name: 'Task', schedule: '0 8 * * *', skill: 'my-skill' }],
      memory: { dailySections: [], reads: [] },
      heartbeat: [],
      files: { skills: {}, templates: [] },
      workspace: {},
    };

    const result = generateDresscode(dress);

    expect(result).toContain('## Skills');
    expect(result).toContain('## Crons');
    expect(result).not.toContain('## Memory');
    expect(result).not.toContain('## Heartbeat');
    expect(result).not.toContain('## Plugins');
  });
});
