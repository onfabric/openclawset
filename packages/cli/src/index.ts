import { execute } from '@oclif/core';

import DiffCommand from '#commands/diff.ts';
import DoctorCommand from '#commands/doctor.ts';
import DressCommand from '#commands/dress.ts';
import InitCommand from '#commands/init.ts';
import LingerieListCommand from '#commands/lingerie/list.ts';
import LingerieRemoveCommand from '#commands/lingerie/remove.ts';
import LogCommand from '#commands/log.ts';
import ParamsCommand from '#commands/params.ts';
import PersonalityCommand from '#commands/personality/index.ts';
import PersonalitySetCommand from '#commands/personality/set.ts';
import RollbackCommand from '#commands/rollback.ts';
import StatusCommand from '#commands/status.ts';
import UndressCommand from '#commands/undress.ts';

// Exported for oclif's explicit command-loading strategy.
// Set synchronously so the export is live before the first await,
// meaning oclif can read it when it re-imports this bundle to discover commands.
export const COMMANDS = {
  diff: DiffCommand,
  doctor: DoctorCommand,
  dress: DressCommand,
  init: InitCommand,
  'lingerie list': LingerieListCommand,
  'lingerie remove': LingerieRemoveCommand,
  log: LogCommand,
  params: ParamsCommand,
  personality: PersonalityCommand,
  'personality set': PersonalitySetCommand,
  rollback: RollbackCommand,
  status: StatusCommand,
  undress: UndressCommand,
};

export async function run() {
  await execute({ dir: import.meta.url });
}
