import type { z } from 'zod'
import type { PrincipalId } from '@quackback/ids'
import { forkSettings } from '@/lib/server/fork/db'
import { db, eq, sql, type Transaction } from '@/lib/server/db'

/**
 * Typed access to `fork_settings`, the fork's workspace configuration
 * (conventions §3.5). Each key is declared once with its zod schema; a missing
 * row reads as the schema's defaults, and so does a stored value that no longer
 * parses, so an old or hand-edited row can never switch a fork feature on by
 * accident.
 */
export interface ForkSetting<S extends z.ZodType> {
  key: string
  read(executor?: Executor): Promise<z.output<S>>
  write(value: z.input<S>, by: PrincipalId | null, executor?: Executor): Promise<z.output<S>>
}

type Executor = typeof db | Transaction

export function defineForkSetting<S extends z.ZodType>(key: string, schema: S): ForkSetting<S> {
  return {
    key,
    async read(executor = db) {
      const [row] = await executor
        .select({ value: forkSettings.value })
        .from(forkSettings)
        .where(eq(forkSettings.key, key))
        .limit(1)
      return parseForkSetting(schema, row?.value)
    },
    async write(value, by, executor = db) {
      const parsed = schema.parse(value) as z.output<S>
      await executor
        .insert(forkSettings)
        .values({ key, value: parsed, updatedByPrincipalId: by })
        .onConflictDoUpdate({
          target: forkSettings.key,
          set: { value: parsed, updatedByPrincipalId: by, updatedAt: sql`now()` },
        })
      return parsed
    },
  }
}

/** A stored value, or the schema's defaults when it is absent or no longer valid. */
export function parseForkSetting<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const stored = schema.safeParse(raw ?? {})
  if (stored.success) return stored.data
  return schema.parse({}) as z.output<S>
}
