import { describe, test, expect } from 'bun:test';
import { LocalOpenClawDriver } from '../src/lib/openclaw.js';
import { loadRecording, replayExec } from '../src/lib/exec-recorder.js';
import { join } from 'node:path';
import type { AppliedCron } from '@clawset/core';

const FIXTURE = join(import.meta.dir, 'fixtures', 'dress-undress-session.json');

describe('driver: dress → undress round-trip', () => {
  test('health check succeeds', async () => {
    const calls = await loadRecording(FIXTURE);
    const driver = new LocalOpenClawDriver({ execFn: replayExec(calls) });

    const health = await driver.health();
    expect(health.ok).toBe(true);
  });

  test('cronAdd creates crons that cronList returns', async () => {
    const calls = await loadRecording(FIXTURE);
    const driver = new LocalOpenClawDriver({ execFn: replayExec(calls) });

    // health (consumed)
    await driver.health();

    // list before — no fitness crons
    const before = await driver.cronList();
    const fitnessBefore = before.filter((c) => c.name.includes('fitness-coach'));
    expect(fitnessBefore).toHaveLength(0);

    // add two crons — skill field auto-generates the --message
    await driver.cronAdd({
      id: 'workout-schedule',
      name: 'Daily workout schedule',
      schedule: '30 21 * * 1,2,3,4,5',
      skill: 'workout-schedule',
      dressId: 'fitness-coach',
    });

    await driver.cronAdd({
      id: 'workout-feedback',
      name: 'Post-workout check-in',
      schedule: '30 22 * * 1,2,3,4,5',
      skill: 'workout-feedback',
      dressId: 'fitness-coach',
    });

    // list after — should have the two fitness crons
    const after = await driver.cronList();
    const fitnessAfter = after.filter((c) => c.name.includes('fitness-coach'));
    expect(fitnessAfter).toHaveLength(2);
    expect(fitnessAfter.map((c) => c.name).sort()).toEqual([
      '[fitness-coach] Daily workout schedule',
      '[fitness-coach] Post-workout check-in',
    ]);
  });

  test('full dress → undress round-trip leaves no fitness crons', async () => {
    const calls = await loadRecording(FIXTURE);
    const driver = new LocalOpenClawDriver({ execFn: replayExec(calls) });

    // --- dress phase ---
    await driver.health();
    await driver.cronList(); // before-dress list
    await driver.cronAdd({
      id: 'workout-schedule',
      name: 'Daily workout schedule',
      schedule: '30 21 * * 1,2,3,4,5',
      skill: 'workout-schedule',
      dressId: 'fitness-coach',
    });
    await driver.cronAdd({
      id: 'workout-feedback',
      name: 'Post-workout check-in',
      schedule: '30 22 * * 1,2,3,4,5',
      skill: 'workout-feedback',
      dressId: 'fitness-coach',
    });

    // --- undress phase ---
    const cron1: AppliedCron = {
      qualifiedId: 'fitness-coach:workout-schedule',
      displayName: '[fitness-coach] Daily workout schedule',
    };
    const cron2: AppliedCron = {
      qualifiedId: 'fitness-coach:workout-feedback',
      displayName: '[fitness-coach] Post-workout check-in',
    };

    await driver.cronRemove(cron1);
    await driver.cronRemove(cron2);

    // --- verify ---
    const final = await driver.cronList();
    const fitnessAfter = final.filter((c) => c.name.includes('fitness-coach'));
    expect(fitnessAfter).toHaveLength(0);
  });

  test('cronRemove throws if display name not found', async () => {
    // Use a minimal fixture: just a cron list with no matching cron
    const driver = new LocalOpenClawDriver({
      execFn: replayExec([{
        args: ['cron', 'list', '--json'],
        stdout: JSON.stringify({ jobs: [], total: 0 }),
        stderr: '',
        exitCode: 0,
      }]),
    });

    const bogus: AppliedCron = {
      qualifiedId: 'fitness-coach:nonexistent',
      displayName: '[fitness-coach] Does not exist',
    };

    expect(driver.cronRemove(bogus)).rejects.toThrow('not found in openclaw');
  });
});
