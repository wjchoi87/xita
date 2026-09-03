import * as ImagePicker from 'expo-image-picker'
import { MediaTypeOptions } from 'expo-image-picker'
import { useRef, useState } from 'react'
import {
  Button,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { store, useStore } from '@/state/store'

/**
 * Capture — 캡처(텍스트/이미지) → 메모 함지로 (v0.4 §20, §26).
 * Cold-open-to-keyboard (Drafts 원칙): 들어오면 곧바로 키보드. 제품/종류 선택 강요 없음 —
 * 귀속과 분류는 호스트(AI/승인)가 나중에. 오프라인이면 큐에 쌓이고 복귀 후 전송 (§10).
 */
export default function CaptureScreen() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const pending = useStore((s) => s.pending)
  const titleRef = useRef<TextInput>(null)

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
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.body}>
        <Text style={styles.title}>메모 남기기</Text>
        <Text style={styles.meta}>제목만 적어도 됩니다. 어느 제품에 속할지는 승인할 때 정해집니다.</Text>
        <TextInput
          ref={titleRef}
          style={styles.input}
          placeholder="지금 떠오른 것 한 줄"
          value={title}
          onChangeText={setTitle}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => titleRef.current?.focus()}
        />
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
        {saved && <Text style={styles.saved}>저장했습니다 — 호스트와 연결되면 자동 전송됩니다.</Text>}
        {pending > 0 && <Text style={styles.meta}>전송 대기 중인 메모 {pending}건</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { fontSize: 12, color: '#666' },
  saved: { fontSize: 13, color: '#1a7f37' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#999', borderRadius: 8, padding: 12 },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
})
