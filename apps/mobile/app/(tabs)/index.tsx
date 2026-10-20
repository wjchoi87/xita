import { actionKo, statusKo, term } from '@/lib/terms'

import { useRef, useState } from 'react'
import {
  Animated,
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
import { Banner, Button, EmptyState, Loading } from '@/components/ui'
import { useStyles, useTheme, type Theme } from '@/theme'

/**
 * Home — "반응하고 미루는 기계" (MOBILE_UI_HANDOFF 계약).
 * 내가 결정할 일(제안 카드 3액션: tap=상세 / swipe 우=승인 / swipe 좀=내일로 미루기,
 * 순차 승인 모드) / 진행 중 할 일 / 최근 움직임. unpaired 면 페어링 화면.
 */

export default function HomeScreen() {
  const styles = useStyles(makeStyles)
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

  if (phase === 'loading') return <Loading />
  if (phase === 'unpaired') return <PairingScreen />
  if (!host) return null

  const changes = items.filter((i) => i.type === 'change')
  const review = changes.filter((c) => NEEDS_REVIEW.has(c.status.toUpperCase()))

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>XITA</Text>
        <Text style={styles.meta}>
          결정할 일 {needsYou} · 진행 {activeChanges} · 보낸 대기 {pending}
          {conflicts.length > 0 ? ` · 충돌 ${conflicts.length}` : ''} ·{' '}
          {online === false ? '오프라인' : '동기화됨'}
        </Text>
        {!!lastError && <Banner tone="bad">{humanError(lastError)}</Banner>}
        <Button
          variant="secondary"
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
            <Button title="Mac 버전 유지" variant="secondary" disabled={busyConflict === c.op_id} onPress={() => { setBusyConflict(c.op_id); void store.clearConflict(c.op_id).finally(() => setBusyConflict('')) }} />
          </View>
        ))}
      <ProposalCards />

      <Text style={styles.section}>검토 대기 중인 {term('change')}</Text>
      {review.length === 0 ? (
        <EmptyState title="결정 대기 중인 일이 없습니다." />
      ) : (
        review.map((c) => <ChangeRow key={c.id} id={c.id} name={c.name} status={c.status} />)
      )}

      <Text style={styles.section}>진행 중인 {term('change')}</Text>
      {activeChanges === 0 ? (
        <EmptyState title={`진행 중인 ${term('change')}이 없습니다.`} hint={`메모 탭에서 떠오른 것을 남기면, 승인 후 ${term('change')}로 이어집니다.`} />
      ) : (
        changes
          .filter((c) => ACTIVE.has(c.status.toUpperCase()))
          .map((c) => <ChangeRow key={c.id} id={c.id} name={c.name} status={c.status} />)
      )}

      <Text style={styles.section}>최근 움직임</Text>
      {changes.length === 0 && <EmptyState title="아직 기록된 움직임이 없습니다." />}
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
  const styles = useStyles(makeStyles)
  const proposals = useStore((s) => s.proposals)
  const [seq, setSeq] = useState<{ on: boolean; idx: number }>({ on: false, idx: 0 })

  if (proposals.length === 0) return <EmptyState title="결정 대기 중인 제안이 없습니다." hint="호스트에서 새 제안이 오면 여기에 카드로 나타납니다." />

  const controls =
    !seq.on && proposals.length > 1 ? (
      <View style={styles.seqRow}>
        <Text style={styles.seqCounter}>{proposals.length}건 대기</Text>
        <Button title="위에서부터" variant="ghost" onPress={() => setSeq({ on: true, idx: 0 })} />
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
  const styles = useStyles(makeStyles)
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
          <Text style={styles.hint}>{open ? '펼쳐짐 — 아래 버튼 또는 스와이프' : '가볍게 치면 상세 · 오른쪽으로 밀면 승인 · 왼쪽으로 밀면 내일로'}</Text>
        </Pressable>
        {open && (
          <View style={styles.cardActions}>
            <Button title="승인" disabled={busy} onPress={() => act('approve')} />
            <Button title="거절" variant="danger" disabled={busy} onPress={() => act('reject')} />
            <Button title="내일로" variant="secondary" disabled={busy} onPress={() => act('snooze')} />
          </View>
        )}
      </Animated.View>
    </View>
  )
}

// ---- 할 일 행 ----------------------------------------------------------------

function ChangeRow({ id, name, status }: { id: string; name: string; status: string }) {
  const styles = useStyles(makeStyles)
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
  const styles = useStyles(makeStyles)
  const theme = useTheme()
  const [hostInput, setHostInput] = useState<string>('')
  const [code, setCode] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, styles.center]} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>호스트와 연결</Text>
      <TextInput
        style={styles.input}
        placeholder="호스트 주소 (예: http://192.168.0.5:3333)"
        placeholderTextColor={theme.colors.textFaint}
        keyboardAppearance={theme.scheme}
        autoCapitalize="none"
        autoCorrect={false}
        value={hostInput}
        onChangeText={setHostInput}
      />
      <TextInput
        style={styles.input}
        placeholder="페어링 코드 (8자리)"
        placeholderTextColor={theme.colors.textFaint}
        keyboardAppearance={theme.scheme}
        autoCapitalize="characters"
        value={code}
        onChangeText={setCode}
      />
      {!!fail && <Banner tone="bad">{fail}</Banner>}
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
        컴퓨터의 XITA 웹 콘솔 → 설정 → 모바일 연결에서 주소와 페어링 코드를 확인하세요 (터미널이면 xita pair). 코드는 10분 후 만료돼요.
      </Text>
    </ScrollView>
  )
}

const makeStyles = ({ colors: c, space, radius }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { padding: space.lg, paddingBottom: space.xl * 2 },
    center: { flexGrow: 1, justifyContent: 'center', gap: space.sm },
    header: { marginBottom: space.md, gap: space.sm },
    title: { fontSize: 24, fontWeight: '700', color: c.text },
    meta: { fontSize: 12, color: c.textMuted },
    sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    section: { fontSize: 16, fontWeight: '600', color: c.text, marginTop: space.lg, marginBottom: space.sm },
    seqCounter: { fontSize: 12, color: c.textMuted, marginBottom: 6 },
    seqRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    conflictCard: {
      borderWidth: 1,
      borderColor: c.warn,
      borderRadius: radius.md,
      padding: space.md,
      marginVertical: space.xs,
      gap: 6,
      backgroundColor: c.warnSoft,
    },
    card: {
      borderWidth: 1,
      borderColor: c.warn,
      borderRadius: radius.md,
      padding: space.md,
      marginVertical: space.xs,
      backgroundColor: c.surface,
    },
    cardFocused: { borderWidth: 2, backgroundColor: c.warnSoft },
    cardTitle: { fontWeight: '700', fontSize: 15, color: c.text },
    cardBody: { color: c.textMuted, marginTop: 2 },
    cardReason: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    hint: { fontSize: 11, color: c.textFaint, marginTop: 6 },
    cardActions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingVertical: space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    rowName: { flex: 1, fontSize: 15, color: c.text },
    rowStatus: { fontSize: 12, color: c.textMuted, minWidth: 48, textAlign: 'right' },
    stageGroup: { flexDirection: 'row', gap: 6 },
    stageBtn: { backgroundColor: c.accentSoft, paddingHorizontal: 10, paddingVertical: space.xs, borderRadius: 6 },
    stageBtnText: { fontSize: 12, fontWeight: '600', color: c.accent },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: radius.sm,
      padding: 10,
      marginVertical: space.sm,
      width: '100%',
      backgroundColor: c.surface,
      color: c.text,
    },
  })
