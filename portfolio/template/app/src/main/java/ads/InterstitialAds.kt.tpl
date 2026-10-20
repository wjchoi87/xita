package __PKG__.ads

import android.app.Activity
import android.content.Context
import android.util.Log
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import java.util.Calendar

/**
 * 전면 광고. **"작업 완료" 직후에만** 호출한다.
 *
 * 빈도 제한:
 * - 세션당 1회
 * - 하루 [MAX_PER_DAY]회
 *
 * 이 제한을 풀면 단기 수익은 오르지만 평점과 리텐션이 무너진다.
 * 유틸 앱은 3년 이상 수익을 내는 게 목적이므로 제한을 유지한다.
 *
 * 광고가 준비되지 않았거나 한도를 넘으면 **조용히 건너뛰고** 다음 동작을 실행한다.
 * 사용자를 절대 기다리게 하지 않는다.
 */
object InterstitialAds {

    private const val TAG = "InterstitialAds"
    private const val PREFS = "ads_interstitial"
    private const val KEY_DATE = "date"
    private const val KEY_COUNT = "count"
    private const val MAX_PER_DAY = 3

    private var ad: InterstitialAd? = null
    private var loading = false
    private var shownThisSession = false

    fun preload(context: Context) {
        if (!AdsConsent.canRequestAds || ad != null || loading) return
        loading = true
        InterstitialAd.load(
            context.applicationContext,
            AdIds.interstitial,
            AdRequest.Builder().build(),
            object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(loaded: InterstitialAd) {
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
     * 조건을 만족하면 전면 광고를 띄우고, 아니면 즉시 [onDone]을 호출한다.
     * [onDone]은 광고 표시 여부와 무관하게 **정확히 한 번** 호출된다.
     */
    /*
     * 변경 전 정책: show() 호출 직전에 세션·일일 한도를 먼저 소진했다. 표시가 실패해도 한도가 깎였다.
     * 변경 후 정책: 광고가 실제로 화면에 뜬 시점(onAdShowedFullScreenContent)에만 한도를 소진한다.
     * 변경 이유: 표시 실패로 그날의 정상 노출 기회를 잃지 않게 한다.
     * 영향 범위: 전면 광고 빈도 캡(세션당 1회·하루 3회) 집계. 캡 값 자체는 그대로다.
     */
    fun showIfAllowed(activity: Activity, onDone: () -> Unit) {
        val current = ad
        if (shownThisSession || current == null || !isUnderDailyCap(activity)) {
            preload(activity)
            onDone()
            return
        }

        // 같은 광고를 두 번 띄우지 않게 표시 직전에 비운다.
        ad = null
        current.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdShowedFullScreenContent() {
                // 실제로 화면에 떴을 때만 빈도 한도를 소진한다.
                shownThisSession = true
                recordShown(activity)
            }

            override fun onAdDismissedFullScreenContent() {
                preload(activity)
                onDone()
            }

            override fun onAdFailedToShowFullScreenContent(error: AdError) {
                Log.d(TAG, "show failed: ${error.message}")
                preload(activity)
                onDone()
            }
        }

        current.show(activity)
    }

    private fun isUnderDailyCap(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return if (prefs.getString(KEY_DATE, null) == today()) {
            prefs.getInt(KEY_COUNT, 0) < MAX_PER_DAY
        } else {
            true
        }
    }

    private fun recordShown(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val today = today()
        val count = if (prefs.getString(KEY_DATE, null) == today) {
            prefs.getInt(KEY_COUNT, 0)
        } else {
            0
        }
        prefs.edit()
            .putString(KEY_DATE, today)
            .putInt(KEY_COUNT, count + 1)
            .apply()
    }

    private fun today(): String {
        val cal = Calendar.getInstance()
        return "${cal.get(Calendar.YEAR)}-${cal.get(Calendar.DAY_OF_YEAR)}"
    }
}
