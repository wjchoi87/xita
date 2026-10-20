/**
 * 디자인 토큰 — 라이트/다크 두 세트. 화면 코드는 hex 를 직접 쓰지 않고 이 토큰만 참조한다.
 * 대비 기준: text/textMuted 는 surface·bg 위에서 WCAG AA(4.5:1) 이상, textFaint 는 보조 문구용(≈4.5:1).
 * accentText 는 accent 배경 위 글자색(라이트=흰색, 다크=어두운 남색 — 밝은 accent 위 흰 글자 대비 부족 방지).
 */

export type ColorScheme = 'light' | 'dark'
export type ThemePreference = 'system' | ColorScheme

export interface ThemeColors {
  bg: string
  surface: string
  surfaceAlt: string
  text: string
  textMuted: string
  textFaint: string
  border: string
  accent: string
  accentText: string
  accentSoft: string
  ok: string
  okSoft: string
  warn: string
  warnSoft: string
  bad: string
  badSoft: string
}

export interface Theme {
  scheme: ColorScheme
  colors: ThemeColors
  space: typeof space
  radius: typeof radius
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const
export const radius = { sm: 8, md: 12 } as const

const light: ThemeColors = {
  bg: '#f5f6f8',
  surface: '#ffffff',
  surfaceAlt: '#eceff3',
  text: '#111418',
  textMuted: '#4a5260',
  textFaint: '#626a79',
  border: '#d6dbe2',
  accent: '#2457d6',
  accentText: '#ffffff',
  accentSoft: '#e5ecfc',
  ok: '#16703a',
  okSoft: '#e3f3e8',
  warn: '#8a5a00',
  warnSoft: '#fff3d6',
  bad: '#b42318',
  badSoft: '#fdeaea',
}

const dark: ThemeColors = {
  bg: '#0e1014',
  surface: '#171a20',
  surfaceAlt: '#21252d',
  text: '#e9ebef',
  textMuted: '#adb4bf',
  textFaint: '#8a92a0',
  border: '#2d323c',
  accent: '#7aa5ff',
  accentText: '#0a1226',
  accentSoft: '#1b2947',
  ok: '#56c977',
  okSoft: '#11301c',
  warn: '#e6b84a',
  warnSoft: '#36290c',
  bad: '#ff7a72',
  badSoft: '#3d1716',
}

export const themes: Record<ColorScheme, Theme> = {
  light: { scheme: 'light', colors: light, space, radius },
  dark: { scheme: 'dark', colors: dark, space, radius },
}
