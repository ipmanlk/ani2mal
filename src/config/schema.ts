import * as v from 'valibot'

// ISO date-time with optional milliseconds, ending in Z or an offset like +05:30.
const isoDateTimeOffset = v.pipe(
  v.string(),
  v.check(
    (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s),
    'expected an ISO date-time',
  ),
)

export const ConfigSchema = v.object({
  anilist: v.object({
    username: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
  }),
  mal: v.object({
    clientId: v.optional(
      v.pipe(
        v.string(),
        v.minLength(8, 'mal.clientId is required and must look like a real client id'),
      ),
    ),
    clientSecret: v.optional(v.string()),
  }),
})

export type Config = v.InferOutput<typeof ConfigSchema>

export const TokenSchema = v.object({
  access_token: v.pipe(v.string(), v.minLength(10)),
  refresh_token: v.pipe(v.string(), v.minLength(10)),
  token_type: v.literal('Bearer'),
  expires_at: isoDateTimeOffset,
})

export type Token = v.InferOutput<typeof TokenSchema>

// A stored excludes.json is always a plain array; callers fall back to an
// empty list when the file is missing.
export const ExcludesSchema = v.array(v.pipe(v.number(), v.integer(), v.minValue(1)))

export type Excludes = v.InferOutput<typeof ExcludesSchema>

export const PkceSchema = v.object({
  verifier: v.pipe(v.string(), v.minLength(43), v.maxLength(128)),
  createdAt: isoDateTimeOffset,
})

export type PkceData = v.InferOutput<typeof PkceSchema>
