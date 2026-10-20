import * as ImagePicker from 'expo-image-picker'
import { MediaTypeOptions } from 'expo-image-picker'
import { useRef, useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Banner, Button } from '@/components/ui'
import { term } from '@/lib/terms'
import { store, useStore } from '@/state/store'
import { useStyles, useTheme, type Theme } from '@/theme'

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
  const theme = useTheme()
  const styles = useStyles(makeStyles)

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
      <ScrollView style={styles.container} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>메모 남기기</Text>
        <Text style={styles.meta}>제목만 적어도 됩니다. 어느 제품에 속할지는 승인할 때 정해집니다.</Text>
        <TextInput
          ref={titleRef}
          style={styles.input}
          placeholder="지금 떠오른 것 한 줄"
          placeholderTextColor={theme.colors.textFaint}
          keyboardAppearance={theme.scheme}
          value={title}
          onChangeText={setTitle}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => titleRef.current?.focus()}
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="내용 (선택)"
          placeholderTextColor={theme.colors.textFaint}
          keyboardAppearance={theme.scheme}
          multiline
          value={content}
          onChangeText={setContent}
        />
        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.image} />
        )}
        <View style={styles.actions}>
          <Button title="사진 첨부" variant="secondary" onPress={() => void pickImage()} />
          <Button title="저장" onPress={submit} disabled={!title.trim()} />
        </View>
        {saved && <Banner tone="ok">저장했습니다 — 호스트와 연결되면 자동 전송됩니다.</Banner>}
        {pending > 0 && <Text style={styles.meta}>전송 대기 중인 {term('workbench')} {pending}건</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const makeStyles = ({ colors: c, space, radius }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    body: { padding: space.lg, gap: space.md },
    title: { fontSize: 22, fontWeight: '700', color: c.text },
    meta: { fontSize: 12, color: c.textMuted },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: radius.sm,
      padding: space.md,
      backgroundColor: c.surface,
      color: c.text,
      fontSize: 15,
    },
    multiline: { minHeight: 120, textAlignVertical: 'top' },
    image: { width: 160, height: 160, borderRadius: radius.sm, backgroundColor: c.surfaceAlt },
    actions: { flexDirection: 'row', gap: space.sm },
  })
