import { test } from '@japa/runner'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { V4Domain } from '#v4/domain'
import { V4Ops, changeNote, setChangeNote } from '#v4/ops'
import { MarkdownStore } from '#v4/markdown_store'
import {
  chainFor,
  defaultConfig,
  extractJson,
  flattenMessages,
  saveConfig,
  validateConfig,
} from '#v4/ai_router'

function freshWorkspace() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'xita-work-'))
  process.env.XITA_WORKSPACE = ws
  return ws
}

test.group('작업 관리 (할 일·마일스톤)', () => {
  test('한글 제목 할 일·마일스톤을 여러 개 만들어도 충돌·덮어쓰기가 없다', async ({ assert }) => {
    freshWorkspace()
    const domain = new V4Domain()
    const ops = new V4Ops()
    await domain.createProduct({ name: 'Bus When' } as never)
    const products = await new MarkdownStore('product').list()
    const pid = products[0].id
    const a = await domain.createChange({ productId: pid, title: '즐겨찾기 위젯' })
    const b = await domain.createChange({ productId: pid, title: '도착 알림' })
    assert.notEqual(a.id, b.id)
    const m1 = await ops.createMilestone({ product: pid, name: '출시 준비' })
    const m2 = await ops.createMilestone({ product: pid, name: '광고 개선' })
    assert.notEqual(m1.id, m2.id)
    const work = await ops.productWork(pid)
    assert.deepEqual(work.changes.map((c) => c.name).sort(), ['도착 알림', '즐겨찾기 위젯'])
    assert.deepEqual(work.milestones.map((m) => m.name).sort(), ['광고 개선', '출시 준비'])
  })

  test('수정하면 revision·ws_rev·updated_at 이 새로 찍힌다 (sync 누락 회귀)', async ({
    assert,
  }) => {
    freshWorkspace()
    const domain = new V4Domain()
    const ops = new V4Ops()
    await domain.createProduct({ name: 'Rev Test' } as never)
    const products = await new MarkdownStore('product').list()
    const pid = products[0].id
    const c = await domain.createChange({ productId: pid, title: 'Revision check' })
    const before = (await new MarkdownStore('change').read(c.id))!
    await new Promise((r) => setTimeout(r, 5))
    await domain.transitionChange(c.id, 'PLAN')
    await ops.editChange(c.id, { title: '새 제목', priority: 'high', note: '메모 본문' })
    const after = (await new MarkdownStore('change').read(c.id))!
    assert.equal(after.revision, (before.revision ?? 0) + 2)
    assert.isAbove(Number(after.meta.ws_rev), Number(before.meta.ws_rev))
    assert.notEqual(after.meta.updated_at, before.meta.updated_at)
    assert.equal(after.meta.created_at, before.meta.created_at)
    assert.equal(after.meta.name, '새 제목')
    assert.equal(after.meta.priority, 'high')
    assert.equal(changeNote(after.body), '메모 본문')
  })

  test('메모 섹션 쓰기·바꾸기·지우기', ({ assert }) => {
    const base = '# 제목\n\n## Goal\n\n목표\n'
    const one = setChangeNote(base, '첫 메모')
    assert.equal(changeNote(one), '첫 메모')
    const two = setChangeNote(one, '바뀐 메모')
    assert.equal(changeNote(two), '바뀐 메모')
    assert.include(two, '## Goal')
    const none = setChangeNote(two, '')
    assert.equal(changeNote(none), '')
    assert.include(none, '목표')
  })
})

test.group('AI 라우터', () => {
  test('응답에서 JSON 을 꺼낸다 (코드펜스·잡담 허용)', ({ assert }) => {
    assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 })
    assert.deepEqual(extractJson('답: {"b":"x"} 끝'), { b: 'x' })
    assert.isNull(extractJson('JSON 없음'))
  })

  test('CLI 프롬프트는 지시·대화·출력 규칙을 하나로 편다', ({ assert }) => {
    const t = flattenMessages(
      [
        { role: 'system', content: 'S' },
        { role: 'user', content: 'U' },
        { role: 'assistant', content: 'A' },
      ],
      true
    )
    assert.match(t, /\[지시\]\nS[\s\S]*\[사용자\]\nU[\s\S]*\[이전 답변\]\nA[\s\S]*JSON 객체 하나만/)
  })

  test('기본 설정은 유효하고, 잘못된 설정은 이유와 함께 거절된다', ({ assert }) => {
    assert.deepEqual(validateConfig(defaultConfig()), [])
    const errs = validateConfig({
      providers: [
        { id: 'a', kind: 'http', models: [] },
        { id: 'a', kind: 'cli', models: [] },
      ],
      routes: { plan: [{ provider: 'nope', model: 'x' }] },
    } as never)
    assert.isTrue(errs.some((e) => e.includes('baseUrl')))
    assert.isTrue(errs.some((e) => e.includes('중복')))
    assert.isTrue(errs.some((e) => e.includes('command')))
    assert.isTrue(errs.some((e) => e.includes('없는 provider')))
  })

  test('사용자가 추가한 provider 가 체인에 들어가고, sensitive 는 local 만 남는다', async ({
    assert,
  }) => {
    freshWorkspace()
    await saveConfig({
      providers: [
        { id: 'home', kind: 'http', local: true, baseUrl: 'http://127.0.0.1:9/v1', models: ['m'] },
        { id: 'cloud', kind: 'cli', command: ['echo'], output: 'text', models: ['c'] },
        { id: 'off', kind: 'cli', command: ['echo'], enabled: false, models: ['o'] },
      ],
      routes: {
        advice: [
          { provider: 'cloud', model: 'c' },
          { provider: 'off', model: 'o' },
          { provider: 'home', model: 'm' },
        ],
      },
    })
    const all = await chainFor('advice')
    assert.deepEqual(
      all.map((x) => x.step.provider),
      ['cloud', 'home']
    )
    const local = await chainFor('advice', true)
    assert.deepEqual(
      local.map((x) => x.step.provider),
      ['home']
    )
  })
})

test.group('기획 위저드', () => {
  test('AI 없이도 기본 질문으로 진행되고, 확정 전엔 아무것도 만들지 않는다', async ({ assert }) => {
    freshWorkspace()
    const { createPlan, planTurn, planStage, planPatch, confirmPlan, getPlan, renderPlan } =
      await import('#v4/planning')
    const p = await createPlan('사진으로 운동 기록')
    assert.equal(p.status, 'drafting')
    assert.equal(p.messages.at(-1)?.source, 'rule')
    await planTurn(p.id, '짐스냅')
    const moved = await planStage(p.id, 'next')
    assert.equal(moved.stage, 1)
    assert.lengthOf(await new MarkdownStore('product').list(), 0)
    assert.include(renderPlan(moved), '_아직 정하지 않았어요_')
    await assert.rejects(async () => {
      await confirmPlan(p.id)
    }, /코드네임/)
    await planPatch(p.id, {
      name: '짐스냅',
      codename: 'gym-snap',
      mvp_features: [{ title: '사진 인식', why: '입력 없애기' }, '기록 표'],
      extensions: [{ title: '주간 리포트' }],
      monetization: { model: 'ads', details: '배너' },
    })
    const r = await confirmPlan(p.id)
    assert.equal(r.product, 'gym-snap')
    assert.deepEqual(
      r.milestones.map((m) => m.name),
      ['MVP', '확장']
    )
    const work = await new V4Ops().productWork('gym-snap')
    assert.deepEqual(work.changes.map((c) => `${c.name}:${c.status}`).sort(), [
      '기록 표:PLAN',
      '사진 인식:PLAN',
      '주간 리포트:IDEA',
    ])
    assert.isNotNull(await new MarkdownStore('artifact').read('gym-snap-plan'))
    assert.isNotNull(await new MarkdownStore('decision').read('gym-snap-monetization'))
    const final = await getPlan(p.id)
    assert.equal(final.status, 'confirmed')
    await assert.rejects(async () => {
      await planTurn(p.id, '더')
    }, /확정된/)
  })
})

test.group('WHY 게이트', () => {
  test('본문 목적·메모가 있으면 WHY 누락으로 잡지 않는다', async ({ assert }) => {
    const { bodyWhy } = await import('#v4/ops')
    assert.equal(bodyWhy('# t\n\n## Problem / Intent\n\n느려서\n'), '느려서')
    assert.equal(bodyWhy('# t\n\n## 메모\n\n이유\n\n## Scope\n\nx\n'), '이유')
    assert.equal(bodyWhy('# t\n'), '')
  })
})

test.group('상시 모니터링 규칙', () => {
  test('라이브인데 테스트 광고·수익 급감·출시 방치·기한 초과를 잡는다', async ({ assert }) => {
    const { ruleSignals } = await import('#portfolio/monitor')
    const base = {
      archived: false,
      kind: 'android',
      status: 'PRODUCTION',
      privacy: true,
      listing: true,
      graphic: true,
      pendingRelease: false,
      store: { production: 10 },
      versionCode: 10,
      revenue7d: { earnings: 1, prev: 1, impressions: 100 },
      adIds: {
        appId: 'a',
        banner: 'b',
        interstitial: '',
        rewarded: '',
        native: '',
        found: true,
        live: true,
      },
    }
    const now = Date.parse('2026-10-18T00:00:00Z')
    const signals = ruleSignals({
      now,
      cards: [
        { ...base, id: 'test', name: 'T', adIds: { ...base.adIds, banner: '' } },
        { ...base, id: 'drop', name: 'D', revenue7d: { earnings: 0.1, prev: 1, impressions: 10 } },
        { ...base, id: 'pend', name: 'P', pendingRelease: true, versionCode: 12 },
        { ...base, id: 'ok', name: 'O' },
      ] as never,
      changes: [
        {
          id: 'c1',
          product: 'ok',
          name: '오래된 일',
          status: 'BUILD',
          updated_at: '2026-09-01T00:00:00Z',
        },
      ],
      milestones: [
        { id: 'm1', product: 'ok', name: 'MVP', status: 'planned', target_date: '2026-10-01' },
      ],
      aiFailures: [{ provider: 'x', model: 'y', calls: 5, failures: 5 }],
    })
    const keys = signals.map((s) => s.key)
    assert.includeMembers(keys, [
      'test-ads:test',
      'rev-drop:drop',
      'pending:pend:12',
      'stale:c1',
      'overdue:m1',
      'ai-fail:x:y',
    ])
    assert.notInclude(keys.join(' '), ':ok:')
    assert.equal(signals[0].severity, 'high')
  })
})
