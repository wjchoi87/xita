import { test } from '@japa/runner'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { importPlanner } from '#portfolio/planner_import'
import { PortfolioService } from '#portfolio/service'
import { inspectProject } from '#portfolio/inspect'
import { getJob } from '#portfolio/jobs'
import { MarkdownStore } from '#v4/markdown_store'
import { V4Ops } from '#v4/ops'

function write(p: string, content: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

/** 가짜 auto-money: planner + Android 앱 1개(app-log 포함) + 일반 프로젝트 1개 */
function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'xita-portfolio-'))
  const root = path.join(base, 'auto-money')
  const planner = path.join(root, 'planner')
  write(
    path.join(planner, 'projects.json'),
    JSON.stringify({
      version: 1,
      projects: [
        { codename: 'bus-when', label: '내 버스 언제와', desc: '버스 도착정보' },
        {
          codename: 'BeamLink',
          label: 'BeamLink',
          desc: '스트리밍',
          path: path.join(root, 'BeamLink', 'AndroidApp'),
          cmds: [{ name: 'run', cmd: 'echo hi' }],
        },
      ],
    })
  )
  write(
    path.join(planner, 'README.md'),
    '# planner\n\n| 앱 | 코드네임 | 상태 |\n|---|---|---|\n| 버스 | `bus-when` | 프로덕션 live · 무료+광고 |\n'
  )
  write(path.join(planner, 'docs/progress.md'), '# 진행 상황\n\n최종 갱신: 2026-10-15\n')
  write(path.join(planner, 'specs/07-bus-when.md'), '# 버스 스펙\n')
  write(path.join(planner, 'ideas/utility-pool.md'), '# 아이디어\n')
  write(path.join(planner, 'status-cache.json'), '{"version":1}')
  write(
    path.join(planner, 'dashboard/store-cache.json'),
    JSON.stringify({ 'bus-when': { production: 119 } })
  )
  write(path.join(planner, 'tools/deploy.py'), 'print(1)\n')
  write(path.join(planner, 'tools/play-account.json'), '{"secret":true}')
  write(path.join(planner, 'tools/upload.jks'), 'binary')
  write(path.join(planner, 'cli/node_modules/x/index.js'), 'skip')

  const bus = path.join(root, 'bus-when')
  write(path.join(bus, 'gradlew'), '#!/bin/sh\n')
  write(
    path.join(bus, 'app/build.gradle.kts'),
    'android { defaultConfig { applicationId = "com.wonjin.buswhen"\n versionCode = 120\n versionName = "1.1.5" } }\n'
  )
  write(path.join(bus, 'docs/privacy-policy.html'), '<html></html>')
  write(
    path.join(bus, 'docs/app-log.md'),
    '# 앱 기록\n\n## 2026-10-05 09:00 · 배포 {#11112222}\n트랙: production\n'
  )
  write(path.join(root, 'BeamLink', 'AndroidApp', 'package.json'), '{"scripts":{"dev":"vite"}}')
  return { base, root, planner }
}

test.group('portfolio / planner 흡수', (group) => {
  let fx: ReturnType<typeof fixture>
  const saved = { ...process.env }
  group.each.setup(() => {
    fx = fixture()
    process.env.XITA_WORKSPACE = path.join(fx.base, 'ws')
    process.env.XITA_PORTFOLIO_ROOT = fx.root
    process.env.XITA_PORTFOLIO_NAME = 'auto-money'
    return () => {
      process.env = { ...saved }
      fs.rmSync(fx.base, { recursive: true, force: true })
    }
  })

  test('dry-run 은 아무것도 쓰지 않는다', async ({ assert }) => {
    const r = await importPlanner({ dryRun: true })
    assert.equal(r.projects.length, 2)
    assert.isFalse(fs.existsSync(path.join(fx.base, 'ws', 'products')))
    assert.isFalse(fs.existsSync(r.archive.dir!))
  })

  test('원문 무손실 보관 + 비밀 제외 + 구조화 + 재실행 멱등', async ({ assert }) => {
    const r = await importPlanner()
    // 원문: 비밀/node_modules 제외 모든 파일이 바이트 그대로
    const archived = path.join(r.archive.dir!, 'files')
    for (const rel of [
      'projects.json',
      'README.md',
      'docs/progress.md',
      'status-cache.json',
      'dashboard/store-cache.json',
      'tools/deploy.py',
    ]) {
      assert.equal(
        fs.readFileSync(path.join(archived, rel), 'utf8'),
        fs.readFileSync(path.join(fx.planner, rel), 'utf8'),
        rel
      )
    }
    assert.sameMembers(r.archive.excludedSecrets, ['tools/play-account.json', 'tools/upload.jks'])
    assert.isFalse(fs.existsSync(path.join(archived, 'tools/play-account.json')))
    assert.isFalse(fs.existsSync(path.join(archived, 'cli/node_modules')))
    const manifest = JSON.parse(fs.readFileSync(path.join(r.archive.dir!, 'manifest.json'), 'utf8'))
    assert.equal(manifest.files.length, r.archive.files)

    // 프로젝트
    const products = new MarkdownStore('product')
    const bus = await products.read('bus-when')
    assert.equal(bus!.meta.name, '내 버스 언제와')
    assert.equal(bus!.meta.production_status, 'PRODUCTION')
    assert.equal(bus!.meta.monetization, '무료+광고')
    assert.deepEqual(JSON.parse(String(bus!.meta.store_tracks)), { production: 119 })
    const beam = await products.read('beamlink')
    assert.equal(beam!.meta.codename, 'BeamLink')
    assert.equal(beam!.meta.repo_path, path.join(fx.root, 'BeamLink', 'AndroidApp'))

    // 문서: spec 은 해당 제품에 연결
    const ids = r.artifacts.map((a) => a.id)
    assert.includeMembers(ids, [
      'planner-readme',
      'planner-doc-progress',
      'planner-spec-bus-when',
      'planner-idea-utility-pool',
    ])
    assert.equal(r.artifacts.find((a) => a.id === 'planner-spec-bus-when')!.product, 'bus-when')

    // 앱 기록 → 타임라인 (원래 시각)
    assert.equal(r.logs.imported, 1)
    const events = await new V4Ops().timeline('bus-when', 50)
    const log = events.find((e) => e.event_type === 'APP_LOG')!
    assert.include(String(log.title), '배포')
    assert.equal(new Date(String(log.ts)).getDate(), 5)

    // 레지스트리 export (planner 호환)
    const reg = JSON.parse(
      fs.readFileSync(path.join(fx.base, 'ws', '.xita', 'portfolio-registry.json'), 'utf8')
    )
    assert.sameMembers(
      reg.projects.map((p: { codename: string }) => p.codename),
      ['bus-when', 'BeamLink']
    )

    // 재실행: 같은 스냅샷 재사용, 중복 생성 없음
    const r2 = await importPlanner()
    assert.isTrue(r2.archive.reused)
    assert.isTrue(r2.projects.every((p) => p.action === 'unchanged'))
    assert.isTrue(r2.artifacts.every((a) => a.action === 'unchanged'))
    assert.equal(r2.logs.imported, 0)

    // 원본 문서가 바뀌면 덮어쓰지 않고 새 리비전
    fs.appendFileSync(path.join(fx.planner, 'docs/progress.md'), '\n## 2026-10-17 — 추가\n')
    const r3 = await importPlanner()
    assert.isFalse(r3.archive.reused)
    assert.equal(r3.artifacts.find((a) => a.id === 'planner-doc-progress')!.action, 'revised')
  })

  test('카드: 실측(버전·자산) + 출시 대기 판정 + 명령 병합', async ({ assert }) => {
    await importPlanner()
    const svc = new PortfolioService()
    const cards = await svc.listCards()
    const bus = cards.find((c) => c.id === 'bus-when')!
    assert.equal(bus.kind, 'android')
    assert.equal(bus.versionCode, 120)
    assert.isTrue(bus.privacy)
    assert.isTrue(bus.pendingRelease) // 로컬 120 > production 119
    assert.equal(bus.logCount, 1)
    const beam = await svc.detail('beamlink')
    assert.equal(beam.project.kind, 'node')
    assert.deepInclude(beam.commands, { name: 'dev', cmd: 'npm run dev', learned: false })
    assert.deepInclude(beam.commands, { name: 'run', cmd: 'echo hi', learned: true })
  })

  test('보관은 Product 를 지우지 않고 목록에서만 뺀다', async ({ assert }) => {
    await importPlanner()
    const svc = new PortfolioService()
    await svc.setArchived('beamlink', true)
    const visible = await svc.listCards()
    const all = await svc.listCards(true)
    assert.notInclude(
      visible.map((c) => c.id),
      'beamlink'
    )
    assert.include(
      all.map((c) => c.id),
      'beamlink'
    )
    assert.isNotNull(await new MarkdownStore('product').read('beamlink'))
  })

  test('메모 기록은 앱 기록 파일과 타임라인에 함께 남는다', async ({ assert }) => {
    await importPlanner()
    const svc = new PortfolioService()
    const entry = await svc.addLog('bus-when', '메모', '리뷰 답변 완료')
    const { entries } = await svc.log('bus-when')
    assert.equal(entries[0].id, entry.id)
    const events = await new V4Ops().timeline('bus-when', 50)
    assert.isTrue(events.some((e) => String(e.title).includes('리뷰 답변 완료')))
    await svc.removeLog('bus-when', entry.id)
    const after = await svc.log('bus-when')
    assert.notInclude(
      after.entries.map((e) => e.id),
      entry.id
    )
  })

  test('스토어 조회 job: XITA_RESULT 반영 + production 트랙이면 라이브로 승격', async ({
    assert,
  }) => {
    await importPlanner()
    const tools = path.join(fx.base, 'tools')
    write(
      path.join(tools, 'store-versions.py'),
      'import json,sys\nprint("[스토어] bus-when: production 130")\nprint("XITA_RESULT " + json.dumps({"bus-when": {"production": 130, "internal": 9}}))\n'
    )
    process.env.XITA_TOOLS_DIR = tools
    const products = new MarkdownStore('product')
    await products.applyField('bus-when', 'production_status', 'DEVELOPMENT')
    const svc = new PortfolioService()
    const job = await svc.storeRefresh()
    for (let i = 0; i < 100 && !getJob(job.id)!.done; i++)
      await new Promise((r) => setTimeout(r, 50))
    const done = getJob(job.id)!
    assert.isTrue(done.ok, done.lines.join('\n'))
    assert.notInclude(done.lines.join('\n'), 'XITA_RESULT')
    const bus = await products.read('bus-when')
    assert.deepEqual(JSON.parse(String(bus!.meta.store_tracks)), { production: 130, internal: 9 })
    assert.equal(bus!.meta.production_status, 'PRODUCTION')
    const events = await new V4Ops().timeline('bus-when', 50)
    assert.isTrue(events.some((e) => e.event_type === 'PRODUCTION_DETECTED'))
  })

  test('inspect: 없는 폴더는 missing', ({ assert }) => {
    assert.equal(inspectProject(path.join(fx.root, 'nope')).kind, 'missing')
  })
})
