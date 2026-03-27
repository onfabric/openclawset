import { z } from 'zod';
import type { CronDef, MemoryContract, Requires, SecretDef, DressFiles, ResolvedDress } from './schema.js';
import { resolvedDressSchema } from './schema.js';

// ---------------------------------------------------------------------------
// Param definition type — generic over the Zod schema it wraps
// ---------------------------------------------------------------------------

export interface ParamDef<T = unknown> {
  description: string;
  schema: z.ZodType<T>;
  default: T;
}

// ---------------------------------------------------------------------------
// Infer resolved param values from a params record
// ---------------------------------------------------------------------------

export type InferParams<P extends Record<string, ParamDef>> = {
  [K in keyof P]: P[K] extends ParamDef<infer T> ? T : never;
};

// ---------------------------------------------------------------------------
// Dress input — what the dress author writes
// ---------------------------------------------------------------------------

export interface DressInput<P extends Record<string, ParamDef> = Record<string, never>> {
  id: string;
  name: string;
  version: string;
  description?: string;

  params?: P;

  requires?: Partial<Requires>;
  secrets?: Record<string, SecretDef>;

  crons: CronDef[] | ((params: InferParams<P>) => CronDef[]);

  memory?: Partial<MemoryContract>;
  heartbeat?: string[];
  files?: Partial<DressFiles>;
  workspace?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Dress — the validated object stored at runtime
// ---------------------------------------------------------------------------

export interface Dress<P extends Record<string, ParamDef> = Record<string, never>> {
  readonly _input: DressInput<P>;

  /** Resolve with concrete params to get a fully validated dress. */
  resolve(params: InferParams<P>): ResolvedDress;

  /** Get default values for all params. */
  defaults(): InferParams<P>;

  /** Get the param definitions for interactive prompting. */
  paramDefs(): P;
}

// ---------------------------------------------------------------------------
// defineDress — the typed identity + factory function
// ---------------------------------------------------------------------------

export function defineDress<P extends Record<string, ParamDef> = Record<string, never>>(
  input: DressInput<P>,
): Dress<P> {
  return {
    _input: input,

    defaults(): InferParams<P> {
      const result: Record<string, unknown> = {};
      const params = (input.params ?? {}) as P;
      for (const [key, def] of Object.entries(params)) {
        result[key] = (def as ParamDef).default;
      }
      return result as InferParams<P>;
    },

    paramDefs(): P {
      return (input.params ?? {}) as P;
    },

    resolve(params: InferParams<P>): ResolvedDress {
      const crons =
        typeof input.crons === 'function' ? input.crons(params) : input.crons;

      const raw = {
        id: input.id,
        name: input.name,
        version: input.version,
        description: input.description ?? '',
        requires: input.requires ?? {},
        secrets: input.secrets ?? {},
        crons,
        memory: input.memory ?? {},
        heartbeat: input.heartbeat ?? [],
        files: input.files ?? {},
        workspace: input.workspace ?? {},
      };

      return resolvedDressSchema.parse(raw);
    },
  };
}
