package __PKG__.ads

import android.app.Activity
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView

/**
 * 화면 하단 고정 배너.
 *
 * Adaptive Banner를 쓴다. 기기 폭에 맞춰 높이가 정해지므로
 * 배너가 콘텐츠를 덮지 않도록 부모 레이아웃에서 자리를 확보해야 한다.
 *
 * 측정 UI(수평계 버블, 탐지 게이지 등)를 가리면 앱의 존재 이유가 사라진다.
 */
@Composable
fun AdBanner(modifier: Modifier = Modifier) {
    // 동의 확인·SDK 초기화 전에는 광고를 요청하지 않는다.
    if (!AdsConsent.canRequestAds) return
    val context = LocalContext.current
    val widthDp = LocalConfiguration.current.screenWidthDp

    AndroidView(
        modifier = modifier
            .fillMaxWidth()
            .wrapContentHeight(),
        factory = { ctx ->
            AdView(ctx).apply {
                val activity = ctx as? Activity
                val adSize = if (activity != null) {
                    AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(ctx, widthDp)
                } else {
                    AdSize.BANNER
                }
                setAdSize(adSize)
                adUnitId = AdIds.banner
                loadAd(AdRequest.Builder().build())
            }
        }
    )
}
