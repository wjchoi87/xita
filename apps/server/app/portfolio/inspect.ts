import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { keystorePropsPath } from '#portfolio/config'

/*
 * 프로젝트 폴더 실측 (planner dashboard/server.py read_app/detect_kind/AdIds 파싱 이관).
 * 폴더 내용은 읽기만 한다. 쓰기는 writeAdIds/bumpVersionCode 두 곳뿐.
 */

export type ProjectKind =
  'android' | 'node' | 'rust' | 'go' | 'swift' | 'python' | 'generic' | 'missing'

export interface AdIds {
  appId: string
  banner: string
  interstitial: string
  rewarded: string
  native: string
  found: boolean
  live: boolean
}

export interface ProjectFacts {
  path: string
  exists: boolean
  kind: ProjectKind
  git: boolean
  package: string | null
  versionName: string | null
  versionCode: number | null
  /** literal = gradle 숫자, git = gitCommitCount() 기반(배포 시 자동 증가 불필요) */
  versionCodeSource: 'literal' | 'git' | null
  keystore: boolean
  privacy: boolean
  listing: boolean
  graphic: boolean
  aab: { size: number; builtAt: number } | null
  adIds: AdIds
}

const exists = (p: string) => fs.existsSync(p)

function readSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

/** planner 는 android/generic 2종이었다 — XITA 는 명령 탐지와 같은 기준으로 세분화 */
export function detectKind(dir: string): ProjectKind {
  if (!exists(dir)) return 'missing'
  if (exists(path.join(dir, 'gradlew')) && exists(path.join(dir, 'app/build.gradle.kts')))
    return 'android'
  if (exists(path.join(dir, 'Cargo.toml'))) return 'rust'
  if (exists(path.join(dir, 'go.mod'))) return 'go'
  if (exists(path.join(dir, 'Package.swift')) || hasXcodeProject(dir)) return 'swift'
  if (exists(path.join(dir, 'package.json'))) return 'node'
  if (exists(path.join(dir, 'pyproject.toml')) || exists(path.join(dir, 'requirements.txt')))
    return 'python'
  return 'generic'
}

function hasXcodeProject(dir: string): boolean {
  try {
    return fs.readdirSync(dir).some((n) => n.endsWith('.xcodeproj') || n.endsWith('.xcworkspace'))
  } catch {
    return false
  }
}

function emptyAdIds(): AdIds {
  return {
    appId: '',
    banner: '',
    interstitial: '',
    rewarded: '',
    native: '',
    found: false,
    live: false,
  }
}

export function manifestAppId(dir: string): string {
  const mf = readSafe(path.join(dir, 'app/src/main/AndroidManifest.xml'))
  if (!mf) return ''
  const m = mf.match(
    /android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"\s*android:value="([^"]*)"/
  )
  return m ? m[1] : ''
}

function walkKt(root: string, out: string[] = [], depth = 0): string[] {
  if (depth > 12) return out
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = path.join(root, e.name)
    if (e.isDirectory()) walkKt(p, out, depth + 1)
    else if (e.isFile() && e.name.endsWith('.kt')) out.push(p)
  }
  return out
}

export function adIdsFile(dir: string, pkg: string | null): string | null {
  if (pkg) {
    const direct = path.join(dir, 'app/src/main/java', ...pkg.split('.'), 'ads/AdIds.kt')
    if (exists(direct)) return direct
  }
  // Scrawl 처럼 AdIds.kt 가 패키지 루트가 아닌 하위 패키지에 있는 경우 폴백.
  const hits = walkKt(path.join(dir, 'app/src/main/java'))
    .filter((f) => f.endsWith(`${path.sep}ads${path.sep}AdIds.kt`))
    .sort()
  return hits[0] ?? null
}

/** 앱 ID(ca-app-pub-…~NNN)의 퍼블리셔로 실제 유닛 ID(ca-app-pub-…/NNN)를 전수 검색 (NightDock 류). */
function scanRealAdUnit(dir: string, appAdId: string): boolean {
  const pub = appAdId.includes('~') ? appAdId.split('~', 1)[0] : ''
  if (!pub) return false
  const pat = new RegExp(pub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/\\d+')
  return walkKt(path.join(dir, 'app/src/main/java')).some((f) => pat.test(readSafe(f) ?? ''))
}

/*
 * 변경 전 정책(planner read_app): `versionCode = 숫자` 만 읽었다 → 2026-10-09 이후 전 앱이 쓰는
 *   `versionCode = gitCommitCount() + 100` 은 null 이 되어 "prod 갱신 대기" 판정이 항상 꺼져 있었다.
 * 변경 후 정책: 숫자면 그대로, `gitCommitCount() [+ N]` 이면 gradle 과 같은 방식
 *   (`git rev-list --count HEAD` + N)으로 계산. 그 밖의 식(BeamLink 앵커 방식 등)은 null.
 * 변경 이유: 로컬 versionCode > Play production versionCode 를 "출시 대기"로 보여주기 위해.
 * 영향 범위: 카드 versionCode/pendingRelease 표시만 (빌드·배포 동작 무관, git 읽기 전용).
 */
export function resolveVersionCode(dir: string, gradle: string): number | null {
  const literal = gradle.match(/versionCode\s*=\s*(\d+)\b(?![ \t]*(?:[-+*(]|\/(?!\/)))/)?.[1]
  if (literal) return Number(literal)
  const m = gradle.match(/versionCode\s*=\s*gitCommitCount\(\)\s*(?:\+\s*(\d+))?/)
  if (!m) return null
  try {
    const out = execFileSync('git', ['-C', dir, 'rev-list', '--count', 'HEAD'], {
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const count = Number(out.toString().trim())
    return Number.isFinite(count) ? count + Number(m[1] ?? 0) : null
  } catch {
    return null
  }
}

export function inspectProject(dir: string): ProjectFacts {
  const facts: ProjectFacts = {
    path: dir,
    exists: exists(dir),
    kind: detectKind(dir),
    git: exists(path.join(dir, '.git')),
    package: null,
    versionName: null,
    versionCode: null,
    versionCodeSource: null,
    // 등록된 앱들이 공용 업로드 키를 쓴다. 앱 폴더가 아니라 공용 위치를 본다.
    keystore: exists(keystorePropsPath()) || exists(path.join(dir, 'keystore.properties')),
    privacy: exists(path.join(dir, 'docs/privacy-policy.html')),
    listing: exists(path.join(dir, 'docs/store-listing.md')),
    graphic: exists(path.join(dir, 'docs/store/feature-graphic.png')),
    aab: null,
    adIds: emptyAdIds(),
  }
  if (facts.kind !== 'android') return facts

  const gradle = readSafe(path.join(dir, 'app/build.gradle.kts')) ?? ''
  facts.package = gradle.match(/applicationId\s*=\s*"([^"]+)"/)?.[1] ?? null
  facts.versionName = gradle.match(/versionName\s*=\s*"([^"]+)"/)?.[1] ?? null
  facts.versionCode = resolveVersionCode(dir, gradle)
  if (facts.versionCode !== null)
    facts.versionCodeSource = /versionCode\s*=\s*gitCommitCount\(\)/.test(gradle)
      ? 'git'
      : 'literal'

  const bundleDir = path.join(dir, 'app/build/outputs/bundle/release')
  try {
    const aabs = fs
      .readdirSync(bundleDir)
      .filter((n) => n.endsWith('.aab'))
      .sort()
    if (aabs.length) {
      const st = fs.statSync(path.join(bundleDir, aabs[0]))
      facts.aab = { size: st.size, builtAt: Math.floor(st.mtimeMs / 1000) }
    }
  } catch {
    // 빌드 산출물 없음
  }

  const adFile = adIdsFile(dir, facts.package)
  if (adFile) {
    const src = readSafe(adFile) ?? ''
    facts.adIds.found = true
    for (const [key, constName] of [
      ['banner', 'REAL_BANNER'],
      ['interstitial', 'REAL_INTERSTITIAL'],
      ['rewarded', 'REAL_REWARDED'],
      ['native', 'REAL_NATIVE'],
    ] as const) {
      const m = src.match(new RegExp(`${constName}\\s*=\\s*"([^"]*)"`))
      if (m) facts.adIds[key] = m[1]
    }
  }
  facts.adIds.appId = manifestAppId(dir)
  const anyUnit = ['banner', 'interstitial', 'rewarded', 'native'].some(
    (k) => facts.adIds[k as keyof AdIds]
  )
  // 템플릿 이전 구조처럼 AdIds.kt 없이 유닛 ID가 코드에 박혀 있는 경우(예: NightDock).
  facts.adIds.live = anyUnit ? true : scanRealAdUnit(dir, facts.adIds.appId)
  return facts
}

/** AdIds.kt 와 매니페스트의 애드몹 앱 ID 를 갱신한다 (planner write_ad_ids). */
export async function writeAdIds(
  dir: string,
  pkg: string | null,
  ids: { appId?: string; banner?: string; interstitial?: string; rewarded?: string }
): Promise<string> {
  const file = adIdsFile(dir, pkg)
  if (!file) throw new Error('AdIds.kt를 찾을 수 없습니다')
  let src = await fsp.readFile(file, 'utf8')
  for (const [key, constName] of [
    ['banner', 'REAL_BANNER'],
    ['interstitial', 'REAL_INTERSTITIAL'],
    ['rewarded', 'REAL_REWARDED'],
  ] as const) {
    const value = (ids[key] ?? '').trim().replace(/["\\$]/g, '')
    src = src.replace(new RegExp(`(${constName}\\s*=\\s*)"[^"]*"`), `$1"${value}"`)
  }
  await fsp.writeFile(file, src, 'utf8')
  const changed = ['AdIds.kt']
  const appId = (ids.appId ?? '').trim().replace(/["\\$]/g, '')
  if (appId) {
    const mfPath = path.join(dir, 'app/src/main/AndroidManifest.xml')
    const text = await fsp.readFile(mfPath, 'utf8')
    await fsp.writeFile(
      mfPath,
      text.replace(
        /(android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"\s*\n\s*android:value=)"[^"]*"/,
        `$1"${appId}"`
      ),
      'utf8'
    )
    changed.push('AndroidManifest.xml')
  }
  return changed.join(', ')
}

/**
 * 배포할 때마다 versionCode 를 올린다 (Play 는 같은 versionCode 재업로드 거절).
 * `gitCommitCount()` 기반 versionCode 는 커밋이 곧 버전업이라 손대지 않고 null.
 */
export async function bumpVersionCode(dir: string): Promise<[number, number] | null> {
  for (const rel of ['app/build.gradle.kts', 'build.gradle.kts']) {
    const f = path.join(dir, rel)
    const text = readSafe(f)
    if (text === null) continue
    if (text.includes('gitCommitCount()')) return null
    const m = text.match(/versionCode\s*=\s*(\d+)/)
    if (!m) continue
    const old = Number(m[1])
    await fsp.writeFile(
      f,
      text.replace(/versionCode\s*=\s*\d+/, `versionCode = ${old + 1}`),
      'utf8'
    )
    return [old, old + 1]
  }
  throw new Error('build.gradle.kts에서 versionCode를 찾을 수 없습니다')
}

export interface Cmd {
  name: string
  cmd: string
}

/** 빌드 도구 자동 탐지 (planner cli/projects.ts detectCommands 이관) */
export function detectCommands(dir: string): Cmd[] {
  const cmds: Cmd[] = []
  const has = (f: string) => exists(path.join(dir, f))
  if (has('gradlew')) {
    cmds.push({ name: 'debug', cmd: './gradlew assembleDebug' })
    cmds.push({ name: 'release', cmd: './gradlew assembleRelease' })
  }
  if (has('go.mod')) {
    cmds.push({ name: 'build', cmd: 'go build ./...' })
    cmds.push({ name: 'run', cmd: 'go run .' })
  }
  if (has('Cargo.toml')) {
    cmds.push({ name: 'build', cmd: 'cargo build' })
    cmds.push({ name: 'run', cmd: 'cargo run' })
  }
  if (has('pom.xml')) cmds.push({ name: 'package', cmd: 'mvn -q package' })
  if (has('Makefile')) cmds.push({ name: 'make', cmd: 'make' })
  const pkgRaw = readSafe(path.join(dir, 'package.json'))
  if (pkgRaw) {
    try {
      const scripts = (JSON.parse(pkgRaw).scripts ?? {}) as Record<string, string>
      const prefer = ['dev', 'build', 'start', 'lint', 'test']
      const seen = new Set<string>()
      for (const n of prefer)
        if (n in scripts) {
          cmds.push({ name: n, cmd: `npm run ${n}` })
          seen.add(n)
        }
      for (const n of Object.keys(scripts))
        if (!seen.has(n)) cmds.push({ name: n, cmd: `npm run ${n}` })
    } catch {
      // package.json 파싱 실패면 무시
    }
  }
  return cmds
}
