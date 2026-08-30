import * as ImagePicker from 'expo-image-picker'
import { MediaTypeOptions } from 'expo-image-picker'
import { useState } from 'react'
import { Button, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { store, useStore } from '@/state/store'

/**
 * Capture — 캡처(텍스트/이미지) → 메모 함지로 (v0.4 §20, §26).
 * PC offline 이어도 큐에 쌓이고, 복귀 후 flush 된다 (§10).
 * 이미지: 로컬 uri 를 workbench 본문에 참조로 남긴다 (binary 복제 없음 — §55).
 */
export default function CaptureScreen() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const pending = useStore((s) => s.pending)

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: MediaTypeOptions.Images,
      quality: 0.8,
      base64: false,
    })
    if (!res.canceled && res.assets?.[0]) setImageUri(res.assets[0].uri)
  }

  const submit = () => {
    const t = title.trim()
    if (!t) return
    let body = content.trim()
    if (imageUri) body = `${body}\n\n![capture](${imageUri})`.trim()
    void store.capture(t, body, 'idea')
    setTitle('')
    setContent('')
    setImageUri(null)
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.body}>
      <Text style={styles.title}>메모 남기기</Text>
      <Text style={styles.meta}>제목만 적어도 됩니다. AI/AI 분류·프로모트는 호스트가 담당.</Text>
      <TextInput style={styles.input} placeholder="제목 (예: 구독 결제 복구 개선)" value={title} onChangeText={setTitle} />
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="내용 (선택)"
        multiline
        value={content}
        onChangeText={setContent}
      />
      {imageUri && (
        <Image source={{ uri: imageUri }} style={{ width: 160, height: 160, borderRadius: 8 }} />
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="사진 첨부" onPress={() => void pickImage()} />
        <Button title="저장" onPress={submit} disabled={!title.trim()} />
      </View>
      <Text style={styles.meta}>Pending ops: {pending}</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { fontSize: 12, color: '#666' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#999', borderRadius: 8, padding: 12 },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
})