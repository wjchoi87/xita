/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),
  XITA_WORKSPACE: Env.schema.string.optional(),
  // AI Provider Layer(#v4/ai.ts §10 원가 우선) — 미설정 시 규칙 기반으로 동작(선택)
  XITA_AI_API_KEY: Env.schema.string.optional(),
  XITA_AI_BASE_URL: Env.schema.string.optional(),
  XITA_AI_MODEL: Env.schema.string.optional(),
  // 외부 관측(§13/§55) — public repo GitHub 은 무토큰 허용, 나머지는 선택
  XITA_GITHUB_TOKEN: Env.schema.string.optional(),
  XITA_LINEAR_TOKEN: Env.schema.string.optional(),
  XITA_FIGMA_TOKEN: Env.schema.string.optional(),
})
