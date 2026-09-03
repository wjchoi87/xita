import { actionKo, statusKo, term } from '@/lib/terms'

import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Button,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { CanonicalDoc } from '@/lib/types'
import { store, useStore } from '@/state/store'

/**
 * Home — "반응하고 미루는 기계" (MOBILE_UI_HANDOFF 계약).
 * 내가 결정할 일(제안 카드 3액션: tap=상세 / swipe 우=승인 / swipe 좀=내일로 미루기,
 * 순차 승인 모드) / 진행 중 할 일 / 최근 움직임. unpaired 면 페어링 화면.
 */

export default function HomeScreen() {
  const [busyConflict, setBusyConflict] = useState('')
  const phase = useStore((s) => s.phase)
  const host = useStore((s) => s.host)
  const needsYou = useStore((s) => s.needsYou)
  const activeChanges = useStore((s) => s.activeChanges)
  const pending = useStore((s) => s.pending)
  const conflicts = useStore((s) => s.conflicts)
  const online = useStore((s) => s.online)
  const lastError = useStore((s) => s.lastError)
  const items = useStore((s) => s.items)

  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    )
  }
  if (phase === 'unpaired') return <PairingScreen />
  if (!host) return null

  const changes = items.filter((i) => i.type === 'change')
  const review = changes.filter((c) => NEEDS_REVIEW.has(c.status.toUpperCase()))

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>XITA</Text>
        <Text style={styles.meta}>
          결정할 일 {needsYou} · 진행 {activeChanges} · 보낸 대기 {pending}
          {conflicts.length > 0 ? ` · 충돌 ${conflicts.length}` : ''} ·{' '}
          {online === false ? '오프라인' : '동기화됨'}
        </Text>
        {!!lastError && (
          <Text style={styles.error} numberOfLines={2}>
            {humanError(lastError)}
          </Text>
        )}
        <Button
          title={pending > 0 ? '보낸 것 다시 시도' : '새로고침'}
          onPress={() => {
            if (pending > 0) void store.reconcileNow()
            else void store.refresh()
          }}
        />
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.section}>내가 결정할 일</Text>
      </View>
      {conflicts.length > 0 &&
        conflicts.map((c) => (
          <View key={c.op_id} style={styles.conflictCard}>
            <Text style={styles.cardTitle}>어긋남: {c.target_id}</Text>
            <Text style={styles.cardReason}>두 곳에서 동시에 바뀌었습니다 — Mac 의 정본을 유지하면 여기 기록이 사라집니다.</Text>
            <Button title="Mac 버전 유지" disabled={busyConflict === c.op_id} onPress={() => { setBusyConflict(c.op_id); void store.clearConflict(c.op_id).finally(() => setBusyConflict('')) }} />
          </View>
        ))}
      <ProposalCards />

      <Text style={styles.section}>검토 대기 중인 {term('change')}</Text>
      {review.length === 0 ? (
        <Text style={styles.empty}>결정 대기 중인 일이 없습니다.</Text>
      ) : (
        review.map((c) => <ChangeRow key={c.id} id={c.id} name={c.name} status={c.status} />)
      )}

      <Text style={styles.section}>진행 중인 {term('change')}</Text>
      {activeChanges === 0 ? (
        <Text style={styles.empty}>진행 중인 할 일이 없습니다.</Text>
      ) : (
        changes
          .filter((c) => ACTIVE.has(c.status.toUpperCase()))
          .map((c) => <ChangeRow key={c.id} id={c.id} name={c.name} status={c.status} />)
      )}

      <Text style={styles.section}>최근 움직임</Text>
      {changes.slice(0, 5).map((c) => (
        <View key={c.id} style={styles.row}>
          <Text style={styles.rowName}>{c.name}</Text>
          <Text style={styles.rowStatus}>{statusKo(c.status)}</Text>
        </View>
      ))}
    </ScrollView>
  )
}

const ACTIVE = new Set(['IDEA', 'PLAN', 'BUILD', 'REVIEW', 'SHIP_READY'])
const NEEDS_REVIEW = new Set(['REVIEW', 'SHIP_READY'])

/** 기술 문자열을 사람 언어로 — 오프라인/거부만 특별 안내, 나머지는 한 줄 요약. */
function humanError(e: string): string {
  if (/Network request failed|fetch|timeout/i.test(e)) return '호스트에 연결할 수 없습니다 — 오프라인 상태에서는 결정만 쌓입니다.'
  if (/REJECTED/i.test(e)) return '거부된 요청이 있습니다 — 상태 전이 조건을 확인해 주세요.'
  return e.length > 90 ? e.slice(0, 90) + '…' : e
}

// ---- 결정할 일 (제안 카드) ---------------------------------------------------

function ProposalCards() {
  const proposals = useStore((s) => s.proposals)
  const [seq, setSeq] = useState<{ on: boolean; idx: number }>({ on: false, idx: 0 })

  if (proposals.length === 0) return <Text style={styles.empty}>결정 대기 중인 제안이 없습니다.</Text>

  const controls =
    !seq.on && proposals.length > 1 ? (
      <View style={styles.seqRow}>
        <Text style={styles.seqCounter}>{proposals.length}건 대기</Text>
        <Button title="위에서부터" onPress={() => setSeq({ on: true, idx: 0 })} />
      </View>
    ) : null

  if (seq.on) {
    const idx = Math.min(seq.idx, proposals.length - 1)
    const p = proposals[idx]
    const advance = () => {
      if (idx + 1 >= proposals.length) setSeq({ on: false, idx: 0 })
      else setSeq({ on: true, idx: idx + 1 })
    }
    return (
      <View>
        {controls}
        <Text style={styles.seqCounter}>
          {idx + 1} / {proposals.length} — 위에서부터 순서대로
        </Text>
        <ProposalCard doc={p} onDone={advance} focused />
      </View>
    )
  }
  return (
    <>
      {controls}
      {proposals.map((p) => (
        <ProposalCard key={p.id} doc={p} />
      ))}
    </>
  )
}

const FIELD_KO: Record<string, string> = {
  problem: '문제',
  proposal: '제안',
  reason: '이유',
  impact: '영향',
  alternatives: '다른 방법',
  recommendation: '권고',
}

/**
 * 결정 카드 3액션 (UX_PATTERN_LIBRARY §E Three-action Inbox):
 * tap=상세 펼침 / swipe 우=승인 / swipe 좌=내일로 미루기. 거절은 상세 안에서.
 * 의존성 추가 없이 PanResponder+Animated (Three-action, 3액션만 노출).
 */
function ProposalCard({ doc, onDone, focused = false }: { doc: CanonicalDoc; onDone?: () => void; focused?: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const pan = useRef(new Animated.ValueXY()).current

  const act = (kind: 'approve' | 'snooze' | 'reject') => {
    if (busy) return
    setBusy(true)
    const after = () => {
      setBusy(false)
      pan.setValue({ x: 0, y: 0 })
      onDone?.()
    }
    if (kind === 'approve') void store.resolveProposal(doc.id, 'approved').finally(after)
    else if (kind === 'reject') void store.resolveProposal(doc.id, 'rejected').finally(after)
    else void store.snoozeProposal(doc.id).then(after)
  }

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_e, g) => pan.setValue({ x: g.dx, y: 0 }),
      onPanResponderRelease: (_e, g) => {
        if (g.dx > 70) act('approve')
        else if (g.dx < -70) act('snooze')
        else pan.setValue({ x: 0, y: 0 })
      },
    })
  ).current

  const meta = doc.meta ?? {}
  const name = String(meta.name ?? doc.id)
  const reason = meta.reason ? String(meta.reason) : ''
  const details = Object.keys(FIELD_KO).filter((k) => k !== 'proposal' && meta[k] !== undefined && meta[k] !== '')

  return (
    <View>
      <Animated.View
        style={[
          styles.card,
          focused && styles.cardFocused,
          { transform: [{ translateX: pan.x }], opacity: busy ? 0.5 : 1 },
        ]}
        {...responder.panHandlers}
      >
        <Pressable onPress={() => setOpen((o) => !o)}>
          <Text style={styles.cardTitle}>{name}</Text>
          {!!meta.proposal && <Text style={styles.cardBody}>{String(meta.proposal)}</Text>}
          {!!reason && !open && (
            <Text style={styles.cardReason} numberOfLines={1}>
              이유: {reason}
            </Text>
          )}
          {open &&
            details.map((k) => (
              <Text key={k} style={styles.cardReason}>
                {FIELD_KO[k]}: {Array.isArray(meta[k]) ? (meta[k] as string[]).join(', ') : String(meta[k])}
              </Text>
            ))}
          <Text style={styles.hint}>{open ? '편쳐짐 — 아래 버튼 또는 스와이프' : '가볍게 치면 상세 · 오른쪽으로 밀면 승인 · 왼쪽으로 밀면 내일로'}</Text>
        </Pressable>
        {open && (
          <View style={styles.cardActions}>
            <Button title="승인" disabled={busy} onPress={() => act('approve')} />
            <Button title="거절" color="red" disabled={busy} onPress={() => act('reject')} />
            <Button title="내일로" disabled={busy} onPress={() => act('snooze')} />
          </View>
        )}
      </Animated.View>
    </View>
  )
}

// ---- 할 일 행 ----------------------------------------------------------------

function ChangeRow({ id, name, status }: { id: string; name: string; status: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowName}>{name}</Text>
      <Text style={styles.rowStatus}>{statusKo(status)}</Text>
      {NEXT.has(status.toUpperCase()) && (
        <View style={styles.stageGroup}>
          {NEXT.get(status.toUpperCase())!.map((next) => (
            <Pressable key={next} style={styles.stageBtn} onPress={() => void store.setStage(id, next)}>
              <Text style={styles.stageBtnText}>{actionKo(next)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

/** 모바일에서 노출하는 다음 단계(Rust lifecycle 표의 사람용 부분집합 — 위반은 호스트가 REJECTED). */
const NEXT = new Map<string, string[]>([
  ['IDEA', ['PLAN']],
  ['PLAN', ['BUILD']],
  ['BUILD', ['REVIEW']],
  ['REVIEW', ['SHIP_READY', 'SHIPPED']],
  ['SHIP_READY', ['SHIPPED']],
])

function PairingScreen() {
  const [hostInput, setHostInput] = useState<string>('')
  const [code, setCode] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.center}>
      <Text style={styles.title}>호스트와 연결</Text>
      <TextInput
        style={styles.input}
        placeholder="http://192.168.0.5:3333 (macOS 호스트)"
        autoCapitalize="none"
        autoCorrect={false}
        value={hostInput}
        onChangeText={setHostInput}
      />
      <TextInput
        style={styles.input}
        placeholder="macOS 에서 받은 페어링 코드"
        autoCapitalize="characters"
        value={code}
        onChangeText={setCode}
      />
      {!!fail && <Text style={styles.error}>{fail}</Text>}
      <Button
        title="페어링"
        disabled={busy || !hostInput.trim() || !code.trim()}
        onPress={() => {
          setBusy(true)
          setFail(null)
          void store
            .setHost(hostInput.trim())
            .then(() => store.pair(code.trim()))
            .catch((e) => setFail(humanError(String(e?.message ?? e))))
            .finally(() => setBusy(false))
        }}
      />
      <Text style={styles.hint}>
        macOS 앱의 설정 화면에서 페어링 코드를 발급한 뒤 입력하세요. 코드는 10분 후 만료됩니다.
      </Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flexGrow: 1, justifyContent: 'center' },
  header: { marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  meta: { fontSize: 12, color: '#666', marginVertical: 6 },
  error: { fontSize: 12, color: '#b00020', marginBottom: 6 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  empty: { color: '#999', fontStyle: 'italic' },
  seqCounter: { fontSize: 12, color: '#666', marginBottom: 6 },
  seqRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  conflictCard: {
    borderWidth: 1,
    borderColor: '#e0a000',
    borderRadius: 10,
    padding: 12,
    marginVertical: 4,
    gap: 6,
    backgroundColor: '#fff8ea',
  },
  card: {
    borderWidth: 1,
    borderColor: '#c8a000',
    borderRadius: 10,
    padding: 12,
    marginVertical: 4,
    backgroundColor: '#fffdf2',
  },
  cardFocused: { borderColor: '#8a7000', borderWidth: 2 },
  cardTitle: { fontWeight: '700', fontSize: 15 },
  cardBody: { color: '#555', marginTop: 2 },
  cardReason: { fontSize: 12, color: '#888', marginTop: 2 },
  hint: { fontSize: 11, color: '#aaa', marginTop: 6 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  rowName: { flex: 1, fontSize: 15 },
  rowStatus: { fontSize: 12, color: '#666', minWidth: 48, textAlign: 'right' },
  stageGroup: { flexDirection: 'row', gap: 6 },
  stageBtn: { backgroundColor: '#eef', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  stageBtnText: { fontSize: 12, fontWeight: '600', color: '#335' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#999', borderRadius: 8, padding: 10, marginVertical: 8, width: '100%' },
})
