import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Button, EmptyState, Loading } from '@/components/ui'
import { term, statusKo } from '@/lib/terms'
import type { CanonicalDoc, UiItem } from '@/lib/types'
import { store, useStore } from '@/state/store'
import { useStyles, useTheme, type Theme } from '@/theme'

/**
 * 제품 — 포트폴리오별 보유 제품과 진행 중인 할 일 (v0.4 §13 Pull State view).
 * 화면 어휘는 terms 사전 경유 (macOS XUI.term과 1:1, Label≠Schema).
 */

/*
 * 변경 전 정책: 제품 전체를 평면 카드로, 그 아래 모든 할 일(상태 무관)을 평면 목록으로 표시. 보관 제품도 노출.
 * 변경 후 정책: product meta.portfolio 가 있으면 포트폴리오별로 묶고(없으면 "포트폴리오 미지정"), 보관 제품
 *   (meta.archived=true 또는 status=archived)은 숨김. 카드 = 이름·운영 상태·버전·진행 중 할 일 수, 탭하면
 *   그 제품의 진행 중 할 일을 펼친다. 제품에 속하지 않은 진행 중 할 일은 별도 묶음.
 * 변경 이유: 제품이 늘면 평면 목록으로는 어디에 무엇이 진행 중인지 파악이 안 됨(감사 지적).
 * 영향 범위: 제품 탭 표시만. 데이터는 store.productDocs(pull 로 받은 product doc 의 meta 그대로)와 items 를 읽기만 한다.
 */
export default function ProductsScreen() {
  const s = useStyles(makeStyles)
  const phase = useStore((st) => st.phase)
  const productDocs = useStore((st) => st.productDocs)
  const items = useStore((st) => st.items)
  const [name, setName] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const view = useMemo(() => buildView(productDocs, items), [productDocs, items])

  if (phase === 'loading') return <Loading />

  const addProduct = () => {
    const n = name.trim()
    if (!n) return
    void store.createProduct(n)
    setName('')
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <Text style={s.summary}>
        {term('product')} {view.visibleCount}개 · 진행 중인 {term('change')} {view.activeTotal}건
        {view.archivedCount > 0 ? ` · 보관됨 ${view.archivedCount}개 숨김` : ''}
      </Text>

      {view.visibleCount === 0 ? (
        <EmptyState
          title={`아직 표시할 ${term('product')}이 없습니다.`}
          hint={
            phase === 'unpaired'
              ? '홈 탭에서 XITA 호스트와 먼저 연결하세요. 연결되면 호스트의 제품이 자동으로 내려옵니다.'
              : '아래에서 이름을 입력해 바로 추가하거나, 호스트에서 포트폴리오를 가져오면 자동으로 동기화됩니다.'
          }
        />
      ) : (
        view.groups.map((g) => (
          <View key={g.key} style={s.group}>
            {view.grouped && (
              <Text style={s.groupTitle}>
                {g.title} <Text style={s.groupCount}>{g.products.length}</Text>
              </Text>
            )}
            {g.products.map((p) => (
              <ProductCard key={p.id} product={p} open={openId === p.id} onToggle={() => setOpenId((cur) => (cur === p.id ? null : p.id))} />
            ))}
          </View>
        ))
      )}

      {view.orphanActive.length > 0 && (
        <View style={s.group}>
          <Text style={s.groupTitle}>
            제품 미지정 {term('change')} <Text style={s.groupCount}>{view.orphanActive.length}</Text>
          </Text>
          <View style={s.card}>
            {view.orphanActive.map((c, i) => (
              <ChangeLine key={c.id} change={c} last={i === view.orphanActive.length - 1} />
            ))}
          </View>
        </View>
      )}

      <Text style={s.groupTitle}>새 {term('product')}</Text>
      <View style={s.addRow}>
        <ThemedInput value={name} onChangeText={setName} placeholder="이름 (예: CarBook)" onSubmitEditing={addProduct} />
        <Button title="추가" disabled={!name.trim()} onPress={addProduct} />
      </View>
    </ScrollView>
  )
}

// ---- view model ----------------------------------------------------------------

const ACTIVE = new Set(['IDEA', 'PLAN', 'BUILD', 'REVIEW', 'SHIP_READY'])
const NO_PORTFOLIO = '__none__'

interface ProductView {
  id: string
  name: string
  codename: string
  status: string
  version: string
  monetization: string
  storeTracks: string
  active: UiItem[]
}

/** meta 값은 서버 front matter 그대로라 타입이 섞인다 — 표시용 문자열로만 꺼낸다. */
function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

function isArchived(d: CanonicalDoc): boolean {
  const a = d.meta?.archived
  return a === true || str(a).toLowerCase() === 'true' || str(d.meta?.status).toLowerCase() === 'archived'
}

const TRACK_KO: Record<string, string> = { production: '프로덕션', beta: '베타', alpha: '알파', internal: '내부' }

/** store_tracks = JSON 문자열 {"production": 12, "beta": 13} — 파싱 실패 시 표시 생략. */
function formatStoreTracks(v: unknown): string {
  let obj: unknown = v
  if (typeof v === 'string') {
    try {
      obj = JSON.parse(v)
    } catch {
      return ''
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return ''
  return Object.entries(obj as Record<string, unknown>)
    .filter(([, code]) => typeof code === 'number' || typeof code === 'string')
    .map(([track, code]) => `${TRACK_KO[track] ?? track} ${String(code)}`)
    .join(' · ')
}

function buildView(productDocs: CanonicalDoc[], items: UiItem[]) {
  const activeChanges = items.filter((i) => i.type === 'change' && ACTIVE.has(i.status.toUpperCase()))
  const visible = productDocs.filter((d) => !isArchived(d))
  const productIds = new Set(productDocs.map((d) => d.id))

  const byPortfolio = new Map<string, ProductView[]>()
  for (const d of visible) {
    const meta = d.meta ?? {}
    const pv: ProductView = {
      id: d.id,
      name: str(meta.name) || d.id,
      codename: str(meta.codename),
      status: str(meta.production_status) || str(meta.status),
      version: str(meta.version),
      monetization: str(meta.monetization),
      storeTracks: formatStoreTracks(meta.store_tracks),
      active: activeChanges.filter((c) => c.product === d.id),
    }
    const key = str(meta.portfolio) || NO_PORTFOLIO
    byPortfolio.set(key, [...(byPortfolio.get(key) ?? []), pv])
  }

  const groups = [...byPortfolio.entries()]
    .sort(([a], [b]) => (a === NO_PORTFOLIO ? 1 : b === NO_PORTFOLIO ? -1 : a.localeCompare(b)))
    .map(([key, products]) => ({
      key,
      title: key === NO_PORTFOLIO ? `${term('portfolio')} 미지정` : key,
      products: products.sort((a, b) => b.active.length - a.active.length || a.name.localeCompare(b.name)),
    }))

  return {
    groups,
    // 포트폴리오 값이 하나도 없으면 묶음 제목 없이 평평하게(불필요한 "미지정" 헤더 방지)
    grouped: groups.some((g) => g.key !== NO_PORTFOLIO),
    visibleCount: visible.length,
    archivedCount: productDocs.length - visible.length,
    activeTotal: activeChanges.length,
    orphanActive: activeChanges.filter((c) => !c.product || !productIds.has(c.product)),
  }
}

// ---- pieces --------------------------------------------------------------------

function ProductCard({ product: p, open, onToggle }: { product: ProductView; open: boolean; onToggle: () => void }) {
  const s = useStyles(makeStyles)
  const meta = [p.version ? `v${p.version.replace(/^v/i, '')}` : '', p.monetization].filter(Boolean).join(' · ')
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      style={({ pressed }) => [s.card, open && s.cardOpen, pressed && s.pressed]}
    >
      <View style={s.cardHead}>
        <View style={s.cardTitleBox}>
          <Text style={s.cardTitle} numberOfLines={1}>
            {p.name}
          </Text>
          {!!p.codename && p.codename !== p.name && (
            <Text style={s.cardSub} numberOfLines={1}>
              {p.codename}
            </Text>
          )}
        </View>
        {!!p.status && (
          <View style={s.pill}>
            <Text style={s.pillText}>{statusKo(p.status)}</Text>
          </View>
        )}
      </View>
      <View style={s.cardFoot}>
        <Text style={s.cardMeta} numberOfLines={1}>
          {meta || (p.storeTracks ? `스토어 ${p.storeTracks}` : '버전 정보 없음')}
        </Text>
        <Text style={[s.count, p.active.length > 0 && s.countOn]}>
          진행 중 {p.active.length}건 {open ? '▴' : '▾'}
        </Text>
      </View>
      {open && (
        <View style={s.expand}>
          {!!p.storeTracks && <Text style={s.cardMeta}>Play 스토어: {p.storeTracks}</Text>}
          {p.active.length === 0 ? (
            <Text style={s.muted}>진행 중인 {term('change')}이 없습니다.</Text>
          ) : (
            p.active.map((c, i) => <ChangeLine key={c.id} change={c} last={i === p.active.length - 1} />)
          )}
        </View>
      )}
    </Pressable>
  )
}

function ChangeLine({ change, last }: { change: UiItem; last: boolean }) {
  const s = useStyles(makeStyles)
  return (
    <View style={[s.line, last && s.lineLast]}>
      <Text style={s.lineName} numberOfLines={2}>
        {change.name}
      </Text>
      <Text style={s.lineStatus}>{statusKo(change.status)}</Text>
    </View>
  )
}

function ThemedInput(props: { value: string; onChangeText: (v: string) => void; placeholder: string; onSubmitEditing: () => void }) {
  const t = useTheme()
  const s = useStyles(makeStyles)
  return (
    <TextInput
      {...props}
      style={s.input}
      placeholderTextColor={t.colors.textFaint}
      keyboardAppearance={t.scheme}
      returnKeyType="done"
    />
  )
}

const makeStyles = ({ colors: c, space, radius }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    body: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
    summary: { fontSize: 13, color: c.textMuted },
    group: { gap: space.sm },
    groupTitle: { fontSize: 13, fontWeight: '700', color: c.textMuted, marginTop: space.sm },
    groupCount: { fontWeight: '400', color: c.textFaint },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      padding: space.md,
      gap: space.sm,
    },
    cardOpen: { borderColor: c.accent, borderWidth: 1 },
    pressed: { opacity: 0.8 },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
    cardTitleBox: { flex: 1, gap: 2 },
    cardTitle: { fontSize: 17, fontWeight: '600', color: c.text },
    cardSub: { fontSize: 12, color: c.textFaint },
    pill: { backgroundColor: c.accentSoft, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 2 },
    pillText: { fontSize: 12, fontWeight: '600', color: c.accent },
    cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
    cardMeta: { flexShrink: 1, fontSize: 12, color: c.textMuted },
    count: { fontSize: 12, color: c.textFaint },
    countOn: { color: c.accent, fontWeight: '600' },
    expand: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: space.sm, gap: space.xs },
    muted: { fontSize: 13, color: c.textFaint },
    line: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingVertical: space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    lineLast: { borderBottomWidth: 0 },
    lineName: { flex: 1, fontSize: 14, color: c.text },
    lineStatus: { fontSize: 12, color: c.textMuted, minWidth: 48, textAlign: 'right' },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    input: {
      flex: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: radius.sm,
      paddingHorizontal: space.md,
      paddingVertical: space.sm + 2,
      backgroundColor: c.surface,
      color: c.text,
      fontSize: 15,
    },
  })
