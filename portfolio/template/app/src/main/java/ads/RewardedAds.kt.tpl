package __PKG__.ads

import android.app.Activity
import android.content.Context
import android.util.Log
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback

/**
 * 리워드 광고. 내보내기·한도 해제 같은 **부가 기능**을 여는 데만 쓴다.
 *
 * 핵심 기능(측정, 기록)은 절대 리워드 뒤에 두지 않는다. 스토어 평점이 무너진다.
 *
 * 중요한 설계 결정:
 * 광고 로드에 실패했을 때도 **보상을 지급한다.**
 * 광고 재고가 없는 건 우리 사정이지 사용자 잘못이 아니다.
 * 여기서 기능을 막으면 "광고를 봐도 안 열린다"는 1점 리뷰가 쌓인다.
 */
object RewardedAds {

    private const val TAG = "RewardedAds"

    private var ad: RewardedAd? = null
    private var loading = false

    fun preload(context: Context) {
        if (!AdsConsent.canRequestAds || ad != null || loading) return
        loading = true
        RewardedAd.load(
            context.applicationContext,
            AdIds.rewarded,
            AdRequest.Builder().build(),
            object : RewardedAdLoadCallback() {
                override fun onAdLoaded(loaded: RewardedAd) {
                    ad = loaded
                    loading = false
                }

                override fun onAdFailedToLoad(error: LoadAdError) {
                    Log.d(TAG, "load failed: ${error.message}")
                    ad = null
                    loading = false
                }
            }
        )
    }

    /**
     * 리워드 광고를 띄운다. 광고가 없으면 즉시 [onReward]를 호출한다.
     * [onReward]는 **정확히 한 번** 호출된다.
     */
    fun show(activity: Activity, onReward: () -> Unit) {
        val current = ad
        if (current == null) {
            preload(activity)
            onReward()
            return
        }

        var earned = false

        current.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                ad = null
                preload(activity)
                // 중간에 닫아도 지급한다. 사용자를 붙잡아두는 것보다 신뢰가 중요하다.
                if (!earned) {
                    earned = true
                    onReward()
                }
            }

            override fun onAdFailedToShowFullScreenContent(error: AdError) {
                Log.d(TAG, "show failed: ${error.message}")
                ad = null
                preload(activity)
                if (!earned) {
                    earned = true
                    onReward()
                }
            }
        }

        current.show(activity) {
            if (!earned) {
                earned = true
                onReward()
            }
        }
    }
}
