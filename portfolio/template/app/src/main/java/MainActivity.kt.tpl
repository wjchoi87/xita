package __PKG__

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import __PKG__.ads.AdBanner
import __PKG__.ui.theme.AppTheme
import __PKG__.ads.AdsConsent
import __PKG__.ads.InterstitialAds
import __PKG__.ads.RewardedAds

/**
 * 스캐폴딩 기본 화면. 각 앱에서 실제 화면으로 교체한다.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AppTheme {
                PlaceholderScreen()
            }
        }
        // 광고 동의 확인 → SDK 초기화. 동의가 필요한 지역이면 이 화면 위에 폼을 띄운다.
        AdsConsent.gather(this) { ctx ->
            InterstitialAds.preload(ctx)
            RewardedAds.preload(ctx)
        }
    }
}

@Composable
private fun PlaceholderScreen() {
    Scaffold(
        bottomBar = { AdBanner() }
    ) { inner ->
        Column(modifier = Modifier.fillMaxSize().padding(inner)) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(text = "__APP_LABEL__")
            }
        }
    }
}
