import { defineDress } from '@clawset/core';

export default defineDress({
  id: 'fabric',
  name: 'Fabric Memory',
  version: '1.0.0',
  description: 'Portable AI memory powered by Fabric — proactive check-ins, memory retrieval, and user profiling.',

  requires: {
    plugins: [
      {
        id: 'openclaw-fabric',
        spec: '@onfabric/openclaw-fabric',
        setupCommand: 'openclaw fabric setup',
      },
    ],
    skills: ['user-check-in', 'deep-user-profile'],
  },

  crons: [
    {
      id: 'deep-user-profile',
      name: 'Daily user profile update',
      schedule: '0 0 * * *',
      skill: 'deep-user-profile',
    },
  ],

  memory: {
    dailySections: ['Fabric'],
    reads: [],
  },

  heartbeat: [
    'Follow the guidelines of the user-check-in skill to check in with the user.',
    'Whenever the user is discussing a topic that could benefit from personalised context, use the retrieve-relevant-user-memories skill before responding.',
  ],

  files: {
    skills: {
      'user-check-in': './skills/user-check-in.md',
      'deep-user-profile': './skills/deep-user-profile.md',
    },
  },
});
