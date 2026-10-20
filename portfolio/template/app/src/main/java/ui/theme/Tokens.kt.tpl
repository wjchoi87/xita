package __PKG__.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/**
 * Semantic 층 — 의미가 붙은 색.
 *
 * 컴포넌트는 **이 토큰만** 참조한다. `Color(0xFF...)` 직접 사용 금지.
 * 팔레트를 바꿔도 컴포넌트 코드는 한 줄도 건드리지 않는 것이 목표다.
 */
@Immutable
data class AppTokens(
    /** 앱 최하단 배경 */
    val canvas: Color,
    /** 표면(패널). 캔버스와 명도차로 구분된다 */
    val surface: Color,
    /** 입력·약한 채움 */
    val subtle: Color,
    val border: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val brand: Color,
    val onBrand: Color,
    val accent: Color,
    val success: Color,
    val successSubtle: Color,
    val warning: Color,
    val warningSubtle: Color,
    val danger: Color,
    val dangerSubtle: Color,
    val isDark: Boolean
)

fun AppPalette.toTokens(dark: Boolean): AppTokens = AppTokens(
    canvas = if (dark) canvasDark else canvas,
    surface = if (dark) surfaceDark else surface,
    subtle = if (dark) subtleDark else subtle,
    border = if (dark) borderDark else border,
    textPrimary = if (dark) textPrimaryDark else textPrimary,
    textSecondary = if (dark) textSecondaryDark else textSecondary,
    textMuted = if (dark) textMutedDark else textMuted,
    brand = if (dark) brandDark else brand,
    onBrand = if (dark) Color(0xFF0B0B0D) else onBrand,
    accent = accent,
    success = if (dark) StatusColors.successDark else StatusColors.success,
    successSubtle = if (dark) StatusColors.successSubtleDark else StatusColors.successSubtle,
    warning = if (dark) StatusColors.warningDark else StatusColors.warning,
    warningSubtle = if (dark) StatusColors.warningSubtleDark else StatusColors.warningSubtle,
    danger = if (dark) StatusColors.dangerDark else StatusColors.danger,
    dangerSubtle = if (dark) StatusColors.dangerSubtleDark else StatusColors.dangerSubtle,
    isDark = dark
)

val LocalAppTokens = staticCompositionLocalOf<AppTokens> {
    error("AppTheme으로 감싸지 않았습니다")
}

/**
 * 간격. 기본 단위 4px, 전부 4의 배수.
 *
 * 핵심 규칙: **그룹 내부 간격 : 그룹 사이 간격 ≥ 1 : 2**
 * 예) 리스트 행 내부 [sm] → 행 사이 [md] → 섹션 사이 [xxl]
 */
object Space {
    val xs = 4.dp
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 24.dp
    val xxl = 32.dp
}

object Radius {
    /** 버튼·입력·셀렉트 */
    val control = 8.dp
    /** 표면·패널 */
    val surface = 12.dp
    /** 바텀시트 상단 */
    val sheet = 16.dp
}
