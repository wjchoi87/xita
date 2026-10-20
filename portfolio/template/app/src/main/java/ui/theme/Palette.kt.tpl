package __PKG__.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Primitive 층 — 원시 색값.
 *
 * 앱은 [Palettes] 중 하나를 골라 쓴다. 구조는 7개 앱이 전부 공유하고
 * 이 매핑만 교체한다. 컴포넌트는 이 파일을 직접 참조하지 않는다.
 * (반드시 Semantic 층인 AppTokens를 거친다)
 */
data class AppPalette(
    val brand: Color,
    val brandDark: Color,
    val onBrand: Color,
    val accent: Color,
    val canvas: Color,
    val canvasDark: Color,
    val surface: Color,
    val surfaceDark: Color,
    val subtle: Color,
    val subtleDark: Color,
    val textPrimary: Color,
    val textPrimaryDark: Color,
    val textSecondary: Color,
    val textSecondaryDark: Color,
    val textMuted: Color,
    val textMutedDark: Color,
    val border: Color,
    val borderDark: Color
)

object Palettes {

    /** ① 신뢰·업무용. 측정 도구 계열에 쓴다. */
    val SlatePro = AppPalette(
        brand = Color(0xFF3B5BDB), brandDark = Color(0xFF5C7CFA), onBrand = Color(0xFFFFFFFF),
        accent = Color(0xFF0EA5E9),
        canvas = Color(0xFFF8FAFC), canvasDark = Color(0xFF0F1117),
        surface = Color(0xFFFFFFFF), surfaceDark = Color(0xFF171923),
        subtle = Color(0xFFF1F5F9), subtleDark = Color(0xFF1E2230),
        textPrimary = Color(0xFF0F172A), textPrimaryDark = Color(0xFFF1F5F9),
        textSecondary = Color(0xFF475569), textSecondaryDark = Color(0xFF94A3B8),
        textMuted = Color(0xFF64748B), textMutedDark = Color(0xFF64748B),
        border = Color(0xFFE2E8F0), borderDark = Color(0xFF2D3748)
    )

    /** ② 콘텐츠·기록. 사람과 관계의 기록물에 쓴다. */
    val WarmPaper = AppPalette(
        brand = Color(0xFFC2410C), brandDark = Color(0xFFFB923C), onBrand = Color(0xFFFFFFFF),
        accent = Color(0xFF0D9488),
        canvas = Color(0xFFFAF9F7), canvasDark = Color(0xFF1C1917),
        surface = Color(0xFFFFFFFF), surfaceDark = Color(0xFF292524),
        subtle = Color(0xFFF5F4F1), subtleDark = Color(0xFF332F2B),
        textPrimary = Color(0xFF292524), textPrimaryDark = Color(0xFFFAFAF9),
        textSecondary = Color(0xFF57534E), textSecondaryDark = Color(0xFFA8A29E),
        textMuted = Color(0xFF78716C), textMutedDark = Color(0xFF78716C),
        border = Color(0xFFE7E5E4), borderDark = Color(0xFF44403C)
    )

    /** ③ 안정·자산. 가계부 계열에 쓴다. */
    val ForestLedger = AppPalette(
        brand = Color(0xFF15803D), brandDark = Color(0xFF4ADE80), onBrand = Color(0xFFFFFFFF),
        accent = Color(0xFFCA8A04),
        canvas = Color(0xFFF7F9F7), canvasDark = Color(0xFF101512),
        surface = Color(0xFFFFFFFF), surfaceDark = Color(0xFF18211B),
        subtle = Color(0xFFEFF3EF), subtleDark = Color(0xFF1F2A23),
        textPrimary = Color(0xFF1A2E1F), textPrimaryDark = Color(0xFFECF2EE),
        textSecondary = Color(0xFF4B5B50), textSecondaryDark = Color(0xFFA3B3A8),
        textMuted = Color(0xFF6B7A70), textMutedDark = Color(0xFF7C8C82),
        border = Color(0xFFDDE5DE), borderDark = Color(0xFF2E3B32)
    )

    /** ④ 하이엔드·정보. 조회·진단 계열에 쓴다. */
    val InkMinimal = AppPalette(
        brand = Color(0xFF18181B), brandDark = Color(0xFFFAFAFA), onBrand = Color(0xFFFAFAFA),
        accent = Color(0xFF8B5CF6),
        canvas = Color(0xFFFFFFFF), canvasDark = Color(0xFF0A0A0B),
        surface = Color(0xFFFAFAFA), surfaceDark = Color(0xFF161618),
        subtle = Color(0xFFF4F4F5), subtleDark = Color(0xFF1F1F22),
        textPrimary = Color(0xFF09090B), textPrimaryDark = Color(0xFFF4F4F5),
        textSecondary = Color(0xFF52525B), textSecondaryDark = Color(0xFFA1A1AA),
        textMuted = Color(0xFF71717A), textMutedDark = Color(0xFF71717A),
        border = Color(0xFFE4E4E7), borderDark = Color(0xFF27272A)
    )
}

/**
 * 상태 색 — 팔레트와 무관하게 의미가 고정된다.
 * 브랜드 색을 상태 의미로 재사용하지 않는다. (DESIGN.md 5.6)
 */
object StatusColors {
    val success = Color(0xFF16A34A)
    val successDark = Color(0xFF4ADE80)
    val successSubtle = Color(0xFFF0FDF4)
    val successSubtleDark = Color(0xFF052E16)

    val warning = Color(0xFFD97706)
    val warningDark = Color(0xFFFBBF24)
    val warningSubtle = Color(0xFFFFFBEB)
    val warningSubtleDark = Color(0xFF451A03)

    val danger = Color(0xFFDC2626)
    val dangerDark = Color(0xFFF87171)
    val dangerSubtle = Color(0xFFFEF2F2)
    val dangerSubtleDark = Color(0xFF450A0A)
}
