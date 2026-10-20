package __PKG__.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember

/**
 * 이 앱이 쓰는 팔레트. **앱마다 이 한 줄만 다르다.**
 * 배정 근거는 planner/docs/design-system.md 참조.
 */
private val ACTIVE_PALETTE = Palettes.SlatePro

/**
 * 앱 테마.
 *
 * `dynamicColor`를 쓰지 않는다. Material You를 켜면 기기 배경화면이 브랜드 색을
 * 덮어써서 제품 정체성이 사라지고, 기기마다 다른 화면이 된다.
 *
 * Material3 colorScheme도 같은 토큰으로 채워서, 기본 컴포넌트를 섞어 쓰더라도
 * 색이 어긋나지 않게 한다.
 */
@Composable
fun AppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val tokens = remember(darkTheme) { ACTIVE_PALETTE.toTokens(darkTheme) }

    val scheme = if (darkTheme) {
        darkColorScheme(
            primary = tokens.brand,
            onPrimary = tokens.onBrand,
            background = tokens.canvas,
            onBackground = tokens.textPrimary,
            surface = tokens.surface,
            onSurface = tokens.textPrimary,
            surfaceVariant = tokens.subtle,
            onSurfaceVariant = tokens.textSecondary,
            outline = tokens.border,
            outlineVariant = tokens.border,
            error = tokens.danger
        )
    } else {
        lightColorScheme(
            primary = tokens.brand,
            onPrimary = tokens.onBrand,
            background = tokens.canvas,
            onBackground = tokens.textPrimary,
            surface = tokens.surface,
            onSurface = tokens.textPrimary,
            surfaceVariant = tokens.subtle,
            onSurfaceVariant = tokens.textSecondary,
            outline = tokens.border,
            outlineVariant = tokens.border,
            error = tokens.danger
        )
    }

    CompositionLocalProvider(LocalAppTokens provides tokens) {
        MaterialTheme(
            colorScheme = scheme,
            typography = Typography(
                titleLarge = AppType.h1,
                titleMedium = AppType.h2,
                titleSmall = AppType.h3,
                bodyLarge = AppType.body,
                bodyMedium = AppType.body,
                bodySmall = AppType.bodySm,
                labelLarge = AppType.label,
                labelMedium = AppType.label,
                labelSmall = AppType.caption
            ),
            content = content
        )
    }
}
