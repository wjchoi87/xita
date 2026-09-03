import { useState } from 'react'
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { term, statusKo } from '@/lib/terms'
import { store, useStore } from '@/state/store'

/**
 * 제품 — 보유 제품과 진행 중인 할 일 (v0.4 §13 Pull State view).
 * 화면 어휘는 terms 사전 경유 (macOS XUI.term과 1:1, Label≠Schema).
 */
export default function ProductsScreen() {
  const items = useStore((s) => s.items)
  const [name, setName] = useState('')

  const products = items.filter((i) => i.type === 'product')
  const changes = items.filter((i) => i.type === 'change')

  const addProduct = () => {
    const n = name.trim()
    if (!n) return
    void store.createProduct(n)
    setName('')
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.body}>
      <Text style={styles.title}>제품</Text>
      {products.length === 0 && <Text style={styles.empty}>아직 제품이 없습니다.</Text>}
      {products.map((p) => {
        const mine = changes.filter((c) => c.product === p.id)
        return (
          <View key={p.id} style={styles.card}>
            <Text style={styles.cardTitle}>{p.name}</Text>
            <Text style={styles.cardMeta}>
              {statusKo(p.status)} · {term('change')} {mine.length}건
            </Text>
          </View>
        )
      })}

      <Text style={styles.section}>할 일</Text>
      {changes.length === 0 && <Text style={styles.empty}>진행 중인 할 일이 없습니다.</Text>}
      {changes.map((c) => (
        <View key={c.id} style={styles.innerRow}>
          <Text style={{ flex: 1 }}>{c.name}</Text>
          <Text style={styles.status}>{statusKo(c.status)}</Text>
        </View>
      ))}

      <Text style={styles.section}>새 제품</Text>
      <TextInput style={styles.input} placeholder="이름 (예: CarBook)" value={name} onChangeText={setName} />
      <Button title="추가" disabled={!name.trim()} onPress={addProduct} />
    </ScrollView>
  )
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  empty: { color: '#999', fontStyle: 'italic' },
  card: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, gap: 4 },
  cardTitle: { fontSize: 17, fontWeight: '600' },
  cardMeta: { fontSize: 12, color: '#777' },
  section: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  innerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  status: { fontSize: 12, color: '#666', minWidth: 48, textAlign: 'right' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#999', borderRadius: 8, padding: 12 },
})
