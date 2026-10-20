import { router } from 'expo-router'
import { useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import appConfig from '../../app.json'
import { Banner, Button } from '@/components/ui'
import { store, useStore } from '@/state/store'
import { useStyles, useThemePreference, type Theme, type ThemePreference } from '@/theme'

/**
 * 설정 — 화면 테마 / 호스트 연결 상태 / 호스트 변경·연결 해제 / 앱 버전.
 * 구조 관리 기능(뷰 빌더·메타 편집)은 두지 않는다(MOBILE_UI_HANDOFF Forbidden).
 */

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
]

export default function SettingsScreen() {
  const s = useStyles(makeStyles)
  const [preference, setPreference] = useThemePreference()
  const phase = useStore((st) => st.phase)
  const host = useStore((st) => st.host)
  const online = useStore((st) => st.online)
  const pending = useStore((st) => st.pending)
  const lastSyncAt = useStore((st) => st.lastSyncAt)
  const [busy, setBusy] = useState(false)

  const paired = phase === 'ready'
  const pairedLabel = phase === 'loading' ? '확인 중' : paired ? '연결됨' : '연결 안 됨'
  const onlineLabel = !paired ? '-' : online === null ? '확인 전' : online ? '온라인' : '오프라인'

  const disconnect = () => {
    setBusy(true)
    void store
      .unpair()
      .then(() => router.navigate('/'))
      .finally(() => setBusy(false))
  }

  const confirmDisconnect = () => {
    const warn =
      pending > 0
        ? `아직 보내지 못한 항목 ${pending}건은 이 기기에 남아 있다가, 다시 연결하면 전송됩니다.`
        : '이 기기에 저장된 내용은 그대로 남습니다.'
    Alert.alert('호스트 연결을 해제할까요?', `${warn}\n해제하면 홈에서 새 호스트 주소와 페어링 코드를 입력합니다.`, [
      { text: '취소', style: 'cancel' },
      { text: '연결 해제', style: 'destructive', onPress: disconnect },
    ])
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.body}>
      <Text style={s.sectionTitle}>화면</Text>
      <View style={s.card}>
        <Text style={s.label}>테마</Text>
        <View style={s.segment} accessibilityRole="radiogroup">
          {THEME_OPTIONS.map((o) => {
            const on = preference === o.value
            return (
              <Pressable
                key={o.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setPreference(o.value)}
                style={[s.segmentItem, on && s.segmentItemOn]}
              >
                <Text style={[s.segmentText, on && s.segmentTextOn]}>{o.label}</Text>
              </Pressable>
            )
          })}
        </View>
        <Text style={s.hint}>시스템을 고르면 기기의 라이트/다크 설정을 바로 따라갑니다.</Text>
      </View>

      <Text style={s.sectionTitle}>호스트 연결</Text>
      <View style={s.card}>
        <InfoRow label="호스트 주소" value={host ?? '설정 안 됨'} />
        <InfoRow label="페어링" value={pairedLabel} tone={paired ? 'ok' : 'warn'} />
        <InfoRow label="네트워크" value={onlineLabel} tone={online === false ? 'bad' : online ? 'ok' : undefined} />
        <InfoRow label="보낸 대기" value={`${pending}건`} tone={pending > 0 ? 'warn' : undefined} />
        <InfoRow label="마지막 동기화" value={formatTime(lastSyncAt)} last />
      </View>
      {pending > 0 && <Banner tone="warn">{`호스트에 아직 전송되지 않은 항목이 ${pending}건 있습니다.`}</Banner>}
      {paired ? (
        <Button title="호스트 변경 / 연결 해제" variant="danger" disabled={busy} onPress={confirmDisconnect} />
      ) : (
        <Text style={s.hint}>홈 탭에서 호스트 주소와 페어링 코드를 입력해 연결하세요. 둘 다 컴퓨터의 XITA 웹 콘솔 → 설정 → 모바일 연결에 있어요.</Text>
      )}

      <Text style={s.sectionTitle}>앱 정보</Text>
      <View style={s.card}>
        <InfoRow label="버전" value={appConfig.expo.version} last />
      </View>
    </ScrollView>
  )
}

function InfoRow({ label, value, tone, last = false }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad'; last?: boolean }) {
  const s = useStyles(makeStyles)
  return (
    <View style={[s.row, last && s.rowLast]}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, tone && s[tone]]} numberOfLines={1} selectable>
        {value}
      </Text>
    </View>
  )
}

function formatTime(iso: string): string {
  if (!iso) return '아직 없음'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const makeStyles = ({ colors: c, space, radius }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    body: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: c.textMuted, marginTop: space.sm },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      padding: space.md,
      gap: space.sm,
    },
    label: { fontSize: 15, fontWeight: '600', color: c.text },
    hint: { fontSize: 12, color: c.textFaint, lineHeight: 18 },
    segment: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.sm, padding: 3 },
    segmentItem: { flex: 1, paddingVertical: space.sm, borderRadius: radius.sm - 2, alignItems: 'center' },
    segmentItemOn: { backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
    segmentText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    segmentTextOn: { color: c.accent },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.md,
      paddingVertical: space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: { fontSize: 14, color: c.textMuted },
    rowValue: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' },
    ok: { color: c.ok },
    warn: { color: c.warn },
    bad: { color: c.bad },
  })
