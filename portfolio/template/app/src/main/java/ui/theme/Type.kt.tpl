package __PKG__.ui.theme

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.sp

/**
 * 타입 스케일.
 *
 * 위계는 **크기와 굵기**로 만든다. 색으로만 위계를 표현하지 않는다.
 * 제목:본문 크기 차 ≥ 1.4배, 굵기 차 ≥ 200을 유지한다. (DESIGN.md 6.3)
 *
 * 금액·측정값은 반드시 [numeric] 계열을 쓴다. 비례 폰트로 숫자를 그리면
 * 값이 바뀔 때마다 자릿수가 흔들려 싸구려로 보인다.
 */
object AppType {

    private val trim = LineHeightStyle(
        alignment = LineHeightStyle.Alignment.Center,
        trim = LineHeightStyle.Trim.None
    )

    val h1 = TextStyle(
        fontSize = 24.sp, fontWeight = FontWeight.Bold,
        lineHeight = 30.sp, letterSpacing = (-0.24).sp, lineHeightStyle = trim
    )

    val h2 = TextStyle(
        fontSize = 20.sp, fontWeight = FontWeight.SemiBold,
        lineHeight = 26.sp, letterSpacing = (-0.2).sp, lineHeightStyle = trim
    )

    val h3 = TextStyle(
        fontSize = 17.sp, fontWeight = FontWeight.SemiBold,
        lineHeight = 23.sp, lineHeightStyle = trim
    )

    val body = TextStyle(
        fontSize = 15.sp, fontWeight = FontWeight.Normal,
        lineHeight = 23.sp, lineHeightStyle = trim
    )

    val bodySm = TextStyle(
        fontSize = 13.sp, fontWeight = FontWeight.Normal,
        lineHeight = 20.sp, lineHeightStyle = trim
    )

    val label = TextStyle(
        fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
        lineHeight = 16.sp, lineHeightStyle = trim
    )

    val caption = TextStyle(
        fontSize = 12.sp, fontWeight = FontWeight.Medium,
        lineHeight = 17.sp, letterSpacing = 0.12.sp, lineHeightStyle = trim
    )

    /** 목록·요약 안의 금액. */
    val numeric = TextStyle(
        fontSize = 17.sp, fontWeight = FontWeight.Bold,
        lineHeight = 19.sp, fontFeatureSettings = TABULAR, lineHeightStyle = trim
    )

    /** 화면 주인공 숫자(잔액, 측정값). */
    val numericLarge = TextStyle(
        fontSize = 34.sp, fontWeight = FontWeight.Bold,
        lineHeight = 38.sp, letterSpacing = (-0.6).sp,
        fontFeatureSettings = TABULAR, lineHeightStyle = trim
    )

    /**
     * 측정 앱 전용. 벽에 붙이거나 곁눈으로 봐야 하므로 크게 유지한다.
     * 이 값을 줄이면 측정 도구로서 쓸모가 없어진다.
     */
    val numericDisplay = TextStyle(
        fontSize = 56.sp, fontWeight = FontWeight.Bold,
        lineHeight = 60.sp, letterSpacing = (-1.2).sp,
        fontFeatureSettings = TABULAR, lineHeightStyle = trim
    )

    /** 코드·식별자처럼 자릿수 정렬이 필요한 값. */
    val mono = TextStyle(
        fontSize = 13.sp, fontWeight = FontWeight.Normal,
        fontFamily = FontFamily.Monospace, lineHeight = 20.sp, lineHeightStyle = trim
    )
}

/** 자릿수 고정(tabular figures). 숫자가 바뀌어도 폭이 흔들리지 않는다. */
private const val TABULAR = "tnum"
