import { Tabs } from 'expo-router'
import { useTheme } from '@/theme'

/** 탭 navigator — 그룹 (tabs) 의 자식 route(index/capture/products/settings)와 이름이 1:1. 색은 theme 토큰. */
export default function TabsLayout() {
  const { colors } = useTheme()
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="capture" options={{ title: '메모' }} />
      <Tabs.Screen name="products" options={{ title: '제품' }} />
      <Tabs.Screen name="settings" options={{ title: '설정' }} />
    </Tabs>
  )
}
