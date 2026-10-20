import { Slot } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { View } from 'react-native'
import { useSyncScheduler } from '@/hooks/useSyncScheduler'
import { store } from '@/state/store'
import { ThemeProvider, useTheme } from '@/theme'

/*
 * 변경 전 정책: 루트 레이아웃이 Tabs 를 직접 선언(name="index"/"capture"/"products").
 *   그러나 파일은 app/(tabs)/ 그룹 안에 있고 그룹 _layout 이 없어 실제 route 이름은 "(tabs)/index" 등 →
 *   Tabs.Screen 이 매칭되지 않아 경고 + 탭 제목/옵션 미적용. 색은 플랫폼 기본(라이트 고정).
 * 변경 후 정책: 루트는 ThemeProvider + Slot 만 담당하고, 탭 선언은 app/(tabs)/_layout.tsx 로 이동.
 *   StatusBar 스타일은 현재 테마(라이트=dark 글자, 다크=light 글자)를 따른다.
 * 변경 이유: expo-router 그룹 규칙(그룹 안 _layout 이 그 그룹 자식의 navigator)과 일치시키고 다크 모드 지원.
 * 영향 범위: 네비게이션 구조(탭 4개: 홈/메모/제품/설정), 상태바 색. store.init / 동기화 스케줄러 동작은 동일.
 */
export default function RootLayout() {
  useEffect(() => {
    void store.init()
  }, [])
  // foreground → pull / pending → flush (v0.4 §13 기본 동작, 폴링 기반)
  useSyncScheduler()

  return (
    <ThemeProvider>
      <ThemedRoot />
    </ThemeProvider>
  )
}

function ThemedRoot() {
  const theme = useTheme()
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Slot />
    </View>
  )
}
