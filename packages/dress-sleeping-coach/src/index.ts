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
        setupNotes: [
          'Before running the setup, create an Oura application at https://developer.ouraring.com/applications',
          'Set the redirect URI to: http://localhost:9876/callback',
          'If running on a remote server, open an SSH tunnel first: ssh -L 9876:localhost:9876 <host>',
          'After entering your Client ID and Secret, open this URL in your local browser (replace <client_id> with your actual Client ID):',
          '  https://cloud.ouraring.com/oauth/authorize?client_id=<client_id>&redirect_uri=http%3A%2F%2Flocalhost%3A9876%2Fcallback&response_type=code&scope=email+personal+daily+heartrate+tag+workout+session+spo2+ring_configuration+stress+heart_health',
          'You can also find the authorization URL in the Oura developer portal under your application settings.',
          'When asked "Enable scheduled morning & evening summaries?", answer No — clawset manages crons instead.',
          'For more info see: https://github.com/rickybloomfield/OuraClaw',
        ],
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
