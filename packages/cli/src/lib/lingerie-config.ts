/**
 * Shared logic for collecting lingerie configSetup values.
 *
 * Supports two modes:
 * - **Preset** (`preset` provided): reads values from the preset map, no prompts.
 * - **Interactive** (`preset` undefined): prompts for each param/property via `input()`.
 *
 * Used by `base.ts:installLingerie` (first install) and `lingerie/update.ts` (reconfigure).
 */
import type { z } from 'zod';
import type { configParamSchema, configPropertySchema } from '#core/schemas/lingerie-json.ts';
import { input } from '#lib/prompt.ts';

type ConfigParam = z.infer<typeof configParamSchema>;
type ConfigProperty = z.infer<typeof configPropertySchema>;

export interface CollectLingerieConfigOpts {
  /** Pre-supplied values (from --config flag). When set, skips all prompts. */
  preset?: Record<string, string>;
  /** Current config values used as defaults in update/reconfigure mode. */
  currentValues?: Record<string, string>;
  /** Called when a required value is missing — should throw or exit. */
  onError: (msg: string) => never;
}

export interface CollectLingerieConfigResult {
  /** Param answers (prompt-only, used in build templates, not stored as config keys). */
  answers: Record<string, string>;
  /** Property values to be written as config keys. */
  configValues: Record<string, string>;
}

/**
 * Collect param answers and property values for a lingerie's configSetup.
 */
export async function collectLingerieConfig(
  params: Record<string, ConfigParam>,
  properties: Record<string, ConfigProperty>,
  opts: CollectLingerieConfigOpts,
): Promise<CollectLingerieConfigResult> {
  const { preset, currentValues, onError } = opts;

  // Collect param answers
  const answers: Record<string, string> = {};
  for (const [id, param] of Object.entries(params)) {
    let value: string;
    if (preset) {
      value = preset[id] ?? param.default ?? '';
    } else {
      const suffix = param.required ? '' : ' (optional)';
      value = await input({
        message: `  ${param.description}${suffix}:`,
        default: currentValues?.[id] ?? param.default,
      });
    }

    if (!value && param.required) {
      onError(`Required param "${id}" was not provided.`);
    }
    if (value) answers[id] = value;
  }

  // Collect property values
  const configValues: Record<string, string> = {};
  for (const [key, prop] of Object.entries(properties)) {
    let value: string;
    if (preset) {
      value = preset[key] ?? currentValues?.[key] ?? prop.default ?? '';
    } else {
      const suffix = prop.required ? '' : ' (optional)';
      const defaultValue = currentValues?.[key] ?? prop.default;
      value = await input({
        message: `  ${prop.description}${suffix}:`,
        default: defaultValue,
      });
    }

    if (!value && prop.required) {
      onError(`Required config "${key}" was not provided.`);
    }
    if (!value) continue;

    if (prop.build) {
      let built = prop.build.replace('{value}', value);
      for (const paramId of prop.params) {
        built = built.replace(`{${paramId}}`, answers[paramId] ?? '');
      }
      // Clean up empty query params
      built = built.replaceAll(/[&?]\w+=(?=&)/g, '');
      built = built.replaceAll(/[&?]\w+=$/g, '');
      built = built.replace('?&', '?');
      configValues[key] = built;
    } else {
      configValues[key] = value;
    }
  }

  return { answers, configValues };
}
