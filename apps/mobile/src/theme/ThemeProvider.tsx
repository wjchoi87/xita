import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { themes, type Theme, type ThemePreference } from './tokens'

/**
 * 테마 컨텍스트 — 선호(system/light/dark)는 AsyncStorage 'xita.theme' 에 저장(기기 로컬 선호, canonical 아님).
 * system 이면 RN useColorScheme(Appearance) 을 따라 OS 전환 시 즉시 바뀐다.
 */

const STORAGE_KEY = 'xita.theme'

interface ThemeContextValue {
  theme: Theme
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function isPreference(v: unknown): v is ThemePreference {
  return v === 'system' || v === 'light' || v === 'dark'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme()
  const [preference, setPref] = useState<ThemePreference>('system')

  useEffect(() => {
    let alive = true
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (alive && isPreference(v)) setPref(v)
      })
      .catch(() => {
        /* 저장소 실패 — 기본값(system) 유지 */
      })
    return () => {
      alive = false
    }
  }, [])

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p)
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {
      /* 저장 실패해도 이번 세션 화면은 바뀐다 */
    })
  }, [])

  const value = useMemo<ThemeContextValue>(() => {
    const scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference
    return { theme: themes[scheme], preference, setPreference }
  }, [preference, system, setPreference])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

export function useTheme(): Theme {
  return useThemeContext().theme
}

export function useThemePreference(): [ThemePreference, (p: ThemePreference) => void] {
  const { preference, setPreference } = useThemeContext()
  return [preference, setPreference]
}

/** makeStyles(theme) 패턴 — factory 는 모듈 레벨 상수여야 테마가 바뀔 때만 재생성된다. */
export function useStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme()
  return useMemo(() => factory(theme), [factory, theme])
}
