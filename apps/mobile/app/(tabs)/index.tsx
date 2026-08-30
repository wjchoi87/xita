import { term, statusKo } from '@/lib/terms'

import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Button,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { store, useStore } from '@/state/store'

/**
 * Home — Needs You / Active Changes / 오프라인·pending 상태 (v0.4 §10, §13).
 * unpaired 상태면 pairing(QR/코드) 입력 화면을 보여준다.
 */


export default function HomeScreen() {
  const phase = useStore((s) => s.phase)
  const host = useStore((s) => s.host)
  const needsYou = useStore((s) => s.needsYou)
  const activeChanges = useStore((s) => s.activeChanges)
  const pending = useStore((s) => s.pending)
  const online = useStore((s) => s.online)
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

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>XITA</Text>
        <Text style={styles.meta}>
          needs you {needsYou} · active {activeChanges} · pending {pending} ·{' '}
          {online === false ? 'offline' : 'synced'}
        </Text>
        <Button
          title={pending > 0 ? '동기화 (reconcile)' : '새로고침'}
          onPress={() => {
            if (pending > 0) void store.reconcileNow()
            else void store.refresh()
          }}
        />
      </View>

      <Text style={styles.section}>내가 결정할 일</Text>
      <ProposalCards />
      {changes.filter((c) => ['REVIEW', 'SHIP_READY', 'review', 'ship_ready'].includes(c.status)).length === 0 ? (
        <Text style={styles.empty}>결정 대기 중인 일이 없습니다.</Text>
      ) : (
        changes
          .filter((c) => ['REVIEW', 'SHIP_READY', 'review', 'ship_ready'].includes(c.status))
          .map((c) => <ChangeRow key={c.id} id={c.id} name={c.name} status={c.status} />)
      )}

      <Text style={styles.section}>진행 중인 할 일</Text>
      {activeChanges === 0 ? (
        <Text style={styles.empty}>진행 중인 할 일이 없습니다.</Text>
      ) : (
        changes
          .filter((c) => ['IDEA', 'PLAN', 'BUILD', 'REVIEW', 'idea', 'plan', 'build', 'review'].includes(c.status))
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

function ProposalCards() {
  // docs 에는 proposal type 이 포함되어 있어도 items(UiItem) 만 노출 — proposals 는 store 재조회
  const [, tick] = useState(0)
  const proposals = store.pendingProposals
  if (proposals.length === 0) return null
  return (
    <>
      {proposals.map((p) => (
        <View key={p.id} style={{ borderWidth: 1, borderColor: '#c8a000', borderRadius: 10, padding: 10, marginVertical: 4 }}>
          <Text style={{ fontWeight: '700' }}>{String(p.meta?.name ?? p.id)}</Text>
          {!!p.meta?.proposal && <Text style={{ color: '#555' }}>{String(p.meta.proposal)}</Text>}
          {!!p.meta?.reason && <Text style={{ fontSize: 11, color: '#999' }}>사유: {String(p.meta.reason)}</Text>}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <Button title="승인" onPress={() => { void store.resolveProposal(p.id, 'approved').finally(() => tick((n) => n + 1)) }} />
            <Button title="거절" color="red" onPress={() => { void store.resolveProposal(p.id, 'rejected').finally(() => tick((n) => n + 1)) }} />
          </View>
        </View>
      ))}
    </>
  )
}

function ChangeRow({ id, name, status }: { id: string; name: string; status: string }) {
  const onStage = useCallback(
    (next: string) => void store.setStage(id, next),
    [id]
  )
  return (
    <View style={styles.row}>
      <Text style={styles.rowName}>{name}</Text>
      <Text style={styles.rowStatus}>{statusKo(status)}</Text>
      <Pressable style={styles.stageBtn} onPress={() => onStage('BUILD')}>
        <Text style={styles.stageBtnText}>BUILD</Text>
      </Pressable>
      <Pressable style={styles.stageBtn} onPress={() => onStage('REVIEW')}>
        <Text style={styles.stageBtnText}>REVIEW</Text>
      </Pressable>
      <Pressable style={styles.stageBtn} onPress={() => onStage('SHIPPED')}>
        <Text style={styles.stageBtnText}>SHIPPED</Text>
      </Pressable>
    </View>
  )
}

function PairingScreen() {
  const [hostInput, setHostInput] = useState<string>('')
  const [code, setCode] = useState<string>('')
  const [busy, setBusy] = useState(false)

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.center}>
      <Text style={styles.title}>호스트와 연결</Text>
      <TextInput
        style={styles.input}
        placeholder="http://localhost:3333 (macOS 호스트)"
        autoCapitalize="none"
        autoCorrect={false}
        value={hostInput}
        onChangeText={setHostInput}
      />
      <Button
        title="호스트 설정"
        disabled={busy}
        onPress={() => {
          setBusy(true)
          void store.setHost(hostInput).finally(() => setBusy(false))
        }}
      />
      <TextInput
        style={styles.input}
        placeholder="macOS 에서 받은 페어링 코드"
        autoCapitalize="characters"
        value={code}
        onChangeText={setCode}
      />
      <Button
        title="페어링"
        disabled={busy || !hostInput || !code}
        onPress={() => {
          setBusy(true)
          void store
            .pair(code)
            .catch(() => setBusy(false))
            .finally(() => setBusy(false))
        }}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flexGrow: 1, justifyContent: 'center' },
  header: { marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  meta: { fontSize: 12, color: '#666', marginVertical: 6 },
  section: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  empty: { color: '#999', fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  rowName: { flex: 1, fontSize: 15 },
  rowStatus: { fontSize: 12, color: '#666', minWidth: 48, textAlign: 'right' },
  stageBtn: { backgroundColor: '#eef', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  stageBtnText: { fontSize: 12, fontWeight: '600', color: '#335' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#999', borderRadius: 8, padding: 10, marginVertical: 8, width: '100%' },
})