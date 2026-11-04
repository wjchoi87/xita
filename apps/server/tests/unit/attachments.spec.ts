import { test } from '@japa/runner'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  flattenMessages,
  hasImages,
  messageText,
  stripImages,
  visionChainOf,
  type ChatMessage,
  type ContentPart,
  type ProviderConfig,
} from '#v4/ai_router'
import { buildUserContent, createPlan, parseAttachments, planTurn } from '#v4/planning'

function freshWorkspace() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'xita-attach-'))
  process.env.XITA_WORKSPACE = ws
  return ws
}

const IMG = (b64 = 'aGVsbG8=') =>
  ({ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }) as ContentPart

test.group('AI 라우터 — 멀티모달 content', () => {
  test('문자열 content 는 그대로, 파트 배열은 텍스트만 편진다', ({ assert }) => {
    const plain: ChatMessage[] = [
      { role: 'system', content: 'S' },
      { role: 'user', content: 'U' },
    ]
    assert.equal(messageText(plain[1]), 'U')

    const mixed: ChatMessage = {
      role: 'user',
      content: [{ type: 'text', text: '이 스크린샷 봐줘' }, IMG()],
    }
    assert.equal(messageText(mixed), '이 스크린샷 봐줘')
    const flat = flattenMessages([...plain, mixed], true)
    assert.match(flat, /\[사용자\]\n이 스크린샷 봐줘/)
    assert.match(flat, /이미지 1장 첨부 — CLI provider 는 볼 수 없음/)
  })

  test('hasImages 판정과 stripImages 대체', ({ assert }) => {
    const noImg: ChatMessage[] = [{ role: 'user', content: '텍스트만' }]
    const withImg: ChatMessage[] = [
      { role: 'user', content: [{ type: 'text', text: '봐줘' }, IMG()] },
    ]
    assert.isFalse(hasImages(noImg))
    assert.isTrue(hasImages(withImg))

    const stripped = stripImages(withImg)
    assert.isFalse(hasImages(stripped))
    assert.equal(typeof stripped[0].content, 'string')
    assert.match(String(stripped[0].content), /\[Image #1 생략/)
  })

  test('visionChainOf 는 http+vision provider 만 남긴다', ({ assert }) => {
    const p = (over: Partial<ProviderConfig>): ProviderConfig => ({
      id: 'x',
      kind: 'http',
      models: ['m'],
      ...over,
    })
    const chain = [
      { step: { provider: 'http-text', model: 'm' }, provider: p({ id: 'http-text' }) },
      {
        step: { provider: 'http-vision', model: 'm' },
        provider: p({ id: 'http-vision', vision: true }),
      },
      {
        step: { provider: 'cli-vision', model: 'm' },
        provider: p({ id: 'cli-vision', kind: 'cli', vision: true, command: ['echo'] }),
      },
    ]
    assert.deepEqual(
      visionChainOf(chain).map((x) => x.step.provider),
      ['http-vision']
    )
  })
})

test.group('기획 위저드 — attachments', () => {
  test('parseAttachments: 정상·개수·형식 검증', ({ assert }) => {
    assert.deepEqual(parseAttachments(undefined), [])
    const ok = parseAttachments([
      { kind: 'image', dataUrl: 'data:image/png;base64,aGVsbG8=' },
      { kind: 'text', name: 'notes.md', content: '가\n나' },
    ])
    assert.equal(ok.length, 2)
    assert.equal(ok[0].kind, 'image')
    assert.equal(ok[1].kind, 'text')

    assert.throws(() => parseAttachments({}), '배열')
    assert.throws(
      () => parseAttachments([{ kind: 'image', dataUrl: 'https://x/y.png' }]),
      'dataUrl'
    )
    assert.throws(() => parseAttachments([{ kind: 'text', content: '  ' }]), '비었')
    assert.throws(
      () => parseAttachments(Array.from({ length: 9 }, () => ({ kind: 'text', content: 'x' }))),
      '8개'
    )
  })

  test('buildUserContent: 텍스트는 인라인 블록, 이미지는 파트로', ({ assert }) => {
    const { display, content } = buildUserContent('이 파일 내용 참고해줘 [File: a.md · 2 lines]', [
      { kind: 'text', name: 'a.md', content: '첫줄\n둘째줄' },
      { kind: 'image', dataUrl: 'data:image/png;base64,aGVsbG8=' },
    ])
    assert.equal(display, '이 파일 내용 참고해줘 [File: a.md · 2 lines]')
    assert.isTrue(Array.isArray(content))
    const parts = content as ContentPart[]
    assert.equal(parts[0].type, 'text')
    assert.match((parts[0] as { text: string }).text, /\[File: a\.md · 2 lines\] ---\n첫줄\n둘째줄/)
    assert.equal(parts[1].type, 'image_url')

    const textOnly = buildUserContent('질문', [{ kind: 'text', name: undefined, content: '본문' }])
    assert.equal(typeof textOnly.content, 'string')
    assert.match(String(textOnly.content), /--- \[Paste · 1 lines\]/)
  })

  test('planTurn: 첨부 원문은 세션에 남지 않고 플레이스홀더만 기록된다', async ({ assert }) => {
    freshWorkspace()
    const s = await createPlan('메모 앱 아이디어')
    const before = s.messages.filter((m) => m.role === 'user').length
    const out = await planTurn(s.id, '이 내용 보고 [Paste #1 +2 lines]', [
      { kind: 'text', name: undefined, content: '비밀 장문 본문\n두번째 줄' },
    ])
    const users = out.messages.filter((m) => m.role === 'user')
    assert.equal(users.length, before + 1)
    assert.equal(users.at(-1)!.content, '이 내용 보고 [Paste #1 +2 lines]')
    const raw = fs.readFileSync(
      path.join(process.env.XITA_WORKSPACE!, 'planning', `${out.id}.json`),
      'utf8'
    )
    assert.notInclude(raw, '비밀 장문 본문')
    // AI 없는 테스트 환경에서도 fallback 질문으로 진행된다
    assert.isTrue(out.messages.filter((m) => m.role === 'assistant').length >= 1)
  })

  test('빈 메시지 + 첨부 없음은 거부, 첨부만은 허용', async ({ assert }) => {
    freshWorkspace()
    const s = await createPlan('테스트')
    await assert.rejects(() => planTurn(s.id, '   ').then(() => {}), /메시지가 비었습니다/)
    const out = await planTurn(s.id, '', [
      { kind: 'image', dataUrl: 'data:image/png;base64,aGVsbG8=' },
    ])
    assert.equal(out.messages.filter((m) => m.role === 'user').at(-1)!.content, '(첨부만 보냄)')
  })
})
