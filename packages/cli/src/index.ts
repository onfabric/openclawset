import { execute } from '@oclif/core';

import DiffCommand from '#commands/diff.ts';
import DoctorCommand from '#commands/doctor.ts';
import DressAddCommand from '#commands/dress/add.ts';
import DressListCommand from '#commands/dress/index.ts';
import DressInfoCommand from '#commands/dress/info.ts';
import DressParamsCommand from '#commands/dress/params.ts';
import DressRemoveCommand from '#commands/dress/remove.ts';
import DressUpdateCommand from '#commands/dress/update.ts';
import DressUpgradeCommand from '#commands/dress/upgrade.ts';
import InitCommand from '#commands/init.ts';
import LingerieAddCommand from '#commands/lingerie/add.ts';
import LingerieListCommand from '#commands/lingerie/index.ts';
import LingerieInfoCommand from '#commands/lingerie/info.ts';
import LingerieRemoveCommand from '#commands/lingerie/remove.ts';
import LingerieUpdateCommand from '#commands/lingerie/update.ts';
import LingerieUpgradeCommand from '#commands/lingerie/upgrade.ts';
import LogCommand from '#commands/log.ts';
import PersonalityListCommand from '#commands/personality/index.ts';
import PersonalitySetCommand from '#commands/personality/set.ts';
import RegistryUpdateCommand from '#commands/registry/update.ts';
import RollbackCommand from '#commands/rollback.ts';
import StatusCommand from '#commands/status.ts';

// Exported for oclif's explicit command-loading strategy.
// Set synchronously so the export is live before the first await,
// meaning oclif can read it when it re-imports this bundle to discover commands.
export const COMMANDS = {
  diff: DiffCommand,
  doctor: DoctorCommand,
  dress: DressListCommand,
  'dress:add': DressAddCommand,
  'dress:info': DressInfoCommand,
  'dress:params': DressParamsCommand,
  'dress:remove': DressRemoveCommand,
  'dress:update': DressUpdateCommand,
  'dress:upgrade': DressUpgradeCommand,
  init: InitCommand,
  lingerie: LingerieListCommand,
  'lingerie:add': LingerieAddCommand,
  'lingerie:info': LingerieInfoCommand,
  'lingerie:remove': LingerieRemoveCommand,
  'lingerie:update': LingerieUpdateCommand,
  'lingerie:upgrade': LingerieUpgradeCommand,
  log: LogCommand,
  personality: PersonalityListCommand,
  'personality:set': PersonalitySetCommand,
  'registry:update': RegistryUpdateCommand,
  rollback: RollbackCommand,
  status: StatusCommand,
};

export async function run() {
  await execute({ dir: import.meta.url });
}
