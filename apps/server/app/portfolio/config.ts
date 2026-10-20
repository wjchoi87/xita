import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { metaDir, workspaceRoot } from '#v4/workspace'

/*
 * Portfolio 설정 (docs/PORTFOLIO.md §2).
 * planner 의 경로 상수(WORKSPACE/PLANNER/TOOLS/secrets)를 env 기반으로 옮겼다.
 * 매 호출마다 env 를 읽는다 — 테스트가 임시 디렉터리로 바꿔 끼울 수 있게.
 */

function expand(p: string): string {
  return p.replace(/^~(?=$|\/)/, os.homedir())
}

export const TRACKS = ['internal', 'alpha', 'beta', 'production'] as const
export type Track = (typeof TRACKS)[number]

/** 앱 저장소들이 모인 폴더 (planner 의 WORKSPACE = ~/workspace/auto-money) */
export function portfolioRoot(): string {
  return path.resolve(expand(process.env.XITA_PORTFOLIO_ROOT || '~/workspace/auto-money'))
}

export function portfolioName(): string {
  return process.env.XITA_PORTFOLIO_NAME || path.basename(portfolioRoot())
}

/** play-account.json / keystore.properties 위치. 앱 gradle 이 planner/tools 를 참조하므로 기본값 유지. */
export function secretsDir(): string {
  return path.resolve(
    expand(process.env.XITA_SECRETS_DIR || path.join(portfolioRoot(), 'planner', 'tools'))
  )
}

export function admobDir(): string {
  return path.resolve(expand(process.env.XITA_ADMOB_DIR || path.join(portfolioRoot(), 'secrets')))
}

export const playKeyPath = () => path.join(secretsDir(), 'play-account.json')
export const keystorePropsPath = () => path.join(secretsDir(), 'keystore.properties')
export const admobClientPath = () => path.join(admobDir(), 'admob-client.json')
export const admobTokenPath = () => path.join(admobDir(), 'admob-token.json')

/** planner 호환 레지스트리 export (derived) — portfolio/tools/*.py 가 읽는다 */
export const registryExportPath = () => path.join(metaDir(), 'portfolio-registry.json')

/** xita 저장소의 portfolio/tools (deploy.py 등) */
export function toolsDir(): string {
  if (process.env.XITA_TOOLS_DIR) return path.resolve(expand(process.env.XITA_TOOLS_DIR))
  // app/portfolio/config.(ts|js) → apps/server → xita repo root
  const here = path.dirname(fileURLToPath(import.meta.url))
  const serverRoot = here.includes(`${path.sep}build${path.sep}`)
    ? path.resolve(here, '..', '..', '..')
    : path.resolve(here, '..', '..')
  return path.resolve(serverRoot, '..', '..', 'portfolio', 'tools')
}

export function python(): string {
  return process.env.XITA_PYTHON || 'python3'
}

export { workspaceRoot }
