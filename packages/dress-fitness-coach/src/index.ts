import { defineDress, z, cronFromTime, addHours } from '@clawset/core';

export default defineDress({
  id: 'fitness-coach',
  name: 'Fitness Coach',
  version: '1.0.0',
  description: 'Sends workout schedule and collects post-training feedback.',

  params: {
    workoutTime: {
      description: 'When do you usually work out? (HH:MM)',
      schema: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
      default: '18:00',
    },
    feedbackDelay: {
      description: 'Hours after workout to ask for feedback',
      schema: z.number().min(0.5).max(8),
      default: 2,
    },
    timezone: {
      description: 'Your timezone (IANA format, e.g. Europe/Rome)',
      schema: z.string().min(1),
      default: 'UTC',
    },
    workDays: {
      description: 'Days to schedule workouts (comma-separated: mon,tue,...)',
      schema: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).min(1),
      default: ['mon', 'tue', 'wed', 'thu', 'fri'] as ('mon' | 'tue' | 'wed' | 'thu' | 'fri')[],
    },
  },

  requires: {
    skills: ['workout-planner'],
  },

  secrets: {},

  crons: (p) => [
    {
      id: 'workout-schedule',
      name: 'Daily workout schedule',
      schedule: cronFromTime(p.workoutTime, p.workDays, p.timezone),
      prompt: [
        'You are helping the user with their fitness routine.',
        'Consult ~/.openclaw/dresses/fitness-coach/GUIDE.md for full context.',
        '',
        "Today's task: send the user their workout plan for today via Telegram.",
        'Keep it concise, motivating, and practical.',
        'Write a brief summary in today\'s daily memory under the "## Fitness" section.',
      ].join('\n'),
    },
    {
      id: 'workout-feedback',
      name: 'Post-workout check-in',
      schedule: cronFromTime(
        addHours(p.workoutTime, p.feedbackDelay),
        p.workDays,
        p.timezone,
      ),
      prompt: [
        'You are helping the user with their fitness routine.',
        'Consult ~/.openclaw/dresses/fitness-coach/GUIDE.md for full context.',
        'Read today\'s "## Fitness" section from daily memory for context.',
        '',
        'Ask the user via Telegram:',
        '- Did they complete the workout?',
        '- How did it feel? (energy, difficulty, any pain)',
        '- Any notes for next time?',
        '',
        'Update the "## Fitness" section in today\'s daily memory with their feedback.',
        'Be encouraging regardless of outcome.',
      ].join('\n'),
    },
  ],

  memory: {
    dailySections: ['Fitness'],
    reads: [],
  },

  heartbeat: [
    'If it is near workout time and no schedule has been sent today, nudge via Telegram.',
  ],

  files: {
    guide: './GUIDE.md',
  },
});
