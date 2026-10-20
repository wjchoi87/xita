import { test } from '@japa/runner'
import {
  insertEntry,
  normalizeKind,
  parseLog,
  removeEntry,
  stamp,
  stampToDate,
  LOG_HEADER,
} from '#portfolio/app_log'
import { parseStatus, tableStatuses } from '#portfolio/planner_import'
import { resolveVersionCode } from '#portfolio/inspect'

test.group('portfolio / app-log (planner 포맷 호환)', () => {
  test('최신 항목이 헤더 바로 아래로 들어가고 다시 파싱된다', ({ assert }) => {
    let text = insertEntry(null, {
      id: 'aaaa1111',
      date: '2026-10-01 10:00',
      kind: '메모',
      body: '첫 기록',
    })
    text = insertEntry(text, {
      id: 'bbbb2222',
      date: '2026-10-02 11:00',
      kind: '배포',
      body: '트랙: internal',
    })
    assert.isTrue(text.startsWith(LOG_HEADER))
    const entries = parseLog(text)
    assert.deepEqual(
      entries.map((e) => [e.id, e.kind, e.body]),
      [
        ['bbbb2222', '배포', '트랙: internal'],
        ['aaaa1111', '메모', '첫 기록'],
      ]
    )
  })

  test('손으로 쓴 항목은 내용 해시 id 로 식별·삭제된다', ({ assert }) => {
    const text = `${LOG_HEADER}\n\n## 2026-09-01 · 메모\n손으로 쓴 줄\n\n## 2026-09-02 10:00 · 노트 {#cafe0001}\n본문\n`
    const entries = parseLog(text)
    assert.lengthOf(entries, 2)
    assert.equal(entries[1].id, 'cafe0001')
    assert.match(entries[0].id, /^[0-9a-f]{8}$/)
    const after = removeEntry(text, entries[0].id)!
    assert.lengthOf(parseLog(after), 1)
    assert.include(after, '{#cafe0001}')
    assert.isNull(removeEntry(text, 'nope'))
  })

  test('기록 시각은 벽시계 시간대 기준 (서버 TZ=UTC 와 무관)', ({ assert }) => {
    const at = new Date('2026-10-16T16:53:00Z')
    assert.equal(stamp(at, 'Asia/Seoul'), '2026-10-17 01:53')
    assert.equal(stamp(at, 'UTC'), '2026-10-16 16:53')
    assert.equal(
      stampToDate('2026-10-17 01:53', 'Asia/Seoul').toISOString(),
      '2026-10-16T16:53:00.000Z'
    )
    assert.equal(stampToDate('2026-09-01', 'Asia/Seoul').toISOString(), '2026-08-31T15:00:00.000Z')
  })

  test('종류 정규화', ({ assert }) => {
    assert.equal(normalizeKind('  #배포·\n'), '배포')
    assert.equal(normalizeKind(''), '메모')
  })
})

test.group('portfolio / planner 상태 표 파싱', () => {
  test('README 표 → 상태/수익모델/메모', ({ assert }) => {
    const md = [
      '| 앱 | 코드네임 | 패키지 | 저장소 | 상태 |',
      '|---|---|---|---|---|',
      '| 소음 측정 | `noise-meter` | `com.x.noise` | `noise-meter/` | 프로덕션 live · 무료+광고 · 실기기 검증 필요 |',
      '| LingoLayer | `lingolayer` | `dev.x` | `LingoLayer/lingolayer/` | MVP 구현 · 미배포 |',
      '| BeamLink | `BeamLink` | `com.getbeamlink` | `BeamLink/` | Android 프로덕션 live · **유료 ₩13,000** · Mac 자체 배포 |',
    ].join('\n')
    const st = tableStatuses(md)
    assert.deepEqual(parseStatus(st.get('noise-meter')), {
      production_status: 'PRODUCTION',
      monetization: '무료+광고',
      status_note: '실기기 검증 필요',
    })
    assert.equal(parseStatus(st.get('lingolayer')).production_status, 'DEVELOPMENT')
    const beam = parseStatus(st.get('beamlink'))
    assert.equal(beam.production_status, 'PRODUCTION')
    assert.equal(beam.monetization, '유료 ₩13,000')
    assert.equal(parseStatus(undefined).production_status, 'DEVELOPMENT')
  })
})

test.group('portfolio / versionCode 해석', () => {
  test('숫자 / gitCommitCount()+N / 알 수 없는 식', ({ assert }) => {
    assert.equal(resolveVersionCode('/nonexistent', 'versionCode = 42 // 주석\n'), 42)
    assert.isNull(resolveVersionCode('/nonexistent', 'versionCode = devVersionCode\n'))
    // git 저장소가 아니면 계산 불가 → null (빌드 동작과 동일하게 실패를 숨기지 않음)
    assert.isNull(resolveVersionCode('/nonexistent', 'versionCode = gitCommitCount() + 100\n'))
    const repo = new URL('../../../../', import.meta.url).pathname
    const n = resolveVersionCode(repo, 'versionCode = gitCommitCount() + 100\n')
    assert.isNumber(n)
    assert.isAbove(n!, 100)
  })
})
