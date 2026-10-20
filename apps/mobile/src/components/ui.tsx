import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { useStyles, useTheme, type Theme } from '@/theme'

/**
 * 공용 UI 조각 — 버튼/빈 상태/알림 띠/로딩. 색은 전부 theme 토큰.
 * RN 기본 Button 은 플랫폼 색(Android 파랑 배경 등)을 써서 다크 모드에서 토큰을 따를 수 없어 대체한다.
 */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export function Button({
  title,
  onPress,
  disabled = false,
  variant = 'primary',
  style,
}: {
  title: string
  onPress: () => void
  disabled?: boolean
  variant?: ButtonVariant
  style?: StyleProp<ViewStyle>
}) {
  const s = useStyles(makeStyles)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.btn, s[variant], (pressed || disabled) && { opacity: disabled ? 0.45 : 0.75 }, style]}
    >
      <Text style={[s.btnText, s[`${variant}Text`]]}>{title}</Text>
    </Pressable>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  const s = useStyles(makeStyles)
  return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{title}</Text>
      {!!hint && <Text style={s.emptyHint}>{hint}</Text>}
    </View>
  )
}

export function Banner({ tone, children }: { tone: 'bad' | 'warn' | 'ok'; children: string }) {
  const s = useStyles(makeStyles)
  return (
    <View style={[s.banner, s[`${tone}Banner`]]}>
      <Text style={[s.bannerText, s[`${tone}BannerText`]]} numberOfLines={3}>
        {children}
      </Text>
    </View>
  )
}

export function Loading() {
  const t = useTheme()
  const s = useStyles(makeStyles)
  return (
    <View style={s.loading}>
      <ActivityIndicator size="large" color={t.colors.accent} />
    </View>
  )
}

const makeStyles = ({ colors: c, space, radius }: Theme) =>
  StyleSheet.create({
    btn: {
      paddingHorizontal: space.lg,
      paddingVertical: space.sm + 2,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    btnText: { fontSize: 15, fontWeight: '600' },
    primary: { backgroundColor: c.accent },
    primaryText: { color: c.accentText },
    secondary: { backgroundColor: c.surface, borderColor: c.border },
    secondaryText: { color: c.text },
    danger: { backgroundColor: c.badSoft, borderColor: c.bad },
    dangerText: { color: c.bad },
    ghost: { backgroundColor: 'transparent', paddingHorizontal: space.sm },
    ghostText: { color: c.accent },
    empty: {
      paddingVertical: space.lg,
      paddingHorizontal: space.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
      backgroundColor: c.surface,
      gap: space.xs,
    },
    emptyTitle: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    emptyHint: { fontSize: 12, color: c.textFaint, lineHeight: 18 },
    banner: { borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: space.sm },
    bannerText: { fontSize: 13, lineHeight: 18 },
    badBanner: { backgroundColor: c.badSoft, borderColor: c.bad },
    badBannerText: { color: c.bad },
    warnBanner: { backgroundColor: c.warnSoft, borderColor: c.warn },
    warnBannerText: { color: c.warn },
    okBanner: { backgroundColor: c.okSoft, borderColor: c.ok },
    okBannerText: { color: c.ok },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  })
