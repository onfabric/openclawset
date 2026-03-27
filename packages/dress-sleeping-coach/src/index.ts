import { defineDress, z, cronFromTime } from '@clawset/core';

export default defineDress({
  id: 'sleeping-coach',
  name: 'Sleeping Coach',
  version: '1.0.0',
  description: 'Sleep coaching powered by Oura Ring — morning reports and evening wind-down advice.',

  params: {
    morningTime: {
      description: 'When to deliver the morning sleep report (HH:MM)',
      schema: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
      default: '07:30',
    },
    timezone: {
      description: 'Your timezone (IANA format, e.g. Europe/Rome)',
      schema: z.string().min(1),
      default: 'UTC',
    },
    activeDays: {
      description: 'Days to run (comma-separated: mon,tue,...)',
      schema: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).min(1),
      default: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[],
    },
  },

  requires: {
    plugins: [
      {
        id: 'ouraclaw',
        spec: '@rickybloomfield/ouraclaw',
        setupCommand: 'openclaw ouraclaw setup',
      },
    ],
    skills: ['sleep-report'],
  },

  crons: (p) => [
    {
      id: 'sleep-report',
      name: 'Morning sleep report',
      schedule: cronFromTime(p.morningTime, p.activeDays, p.timezone),
      skill: 'sleep-report',
    },
  ],

  memory: {
    dailySections: ['Sleep'],
    reads: [],
  },

  heartbeat: [
    'If the user mentions feeling tired, poorly rested, or asks about sleep, use the oura_data tool to check recent sleep data before responding.',
  ],

  files: {
    skills: {
      'sleep-report': './skills/sleep-report.md',
    },
  },
});
