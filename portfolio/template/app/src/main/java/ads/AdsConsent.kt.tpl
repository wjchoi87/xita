package __PKG__.ads

import android.app.Activity
import android.content.Context
import android.util.Log
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.google.android.gms.ads.MobileAds
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform
import __PKG__.R
import java.util.concurrent.atomic.AtomicBoolean

/**
 * 광고 동의(UMP) 관문. 모든 광고 요청(배너·전면·리워드)은 [canRequestAds] 가 true 일 때만 나간다.
 *
 * 동의 폼의 문구·대상 지역은 AdMob 콘솔 "개인정보 보호 및 메시지"에서 만든 메시지를 따른다.
 * 콘솔에 메시지가 없으면 폼 없이 통과한다.
 */
object AdsConsent {

    private const val TAG = "AdsConsent"
    private val initStarted = AtomicBoolean(false)

    /** 동의 확인과 MobileAds 초기화가 끝나 광고를 요청해도 되는 상태. */
    var canRequestAds by mutableStateOf(false)
        private set

    /** 동의를 다시 고칠 진입점을 보여줘야 하는 지역(EEA·영국 등)인지. */
    var privacyOptionsRequired by mutableStateOf(false)
        private set

    /*
     * 변경 전 정책: App.onCreate 에서 동의 확인 없이 MobileAds 를 초기화하고 광고를 바로 요청했다.
     * 변경 후 정책: UMP 로 동의 필요 여부를 먼저 확인한다. 필요한 지역이면 동의 폼을 띄우고,
     *              광고 요청이 허용될 때만 MobileAds 초기화 → [onReady](전면·리워드 미리 로드)를 한 번 실행한다.
     * 변경 이유: EEA·영국 사용자에게 광고를 내보내려면 Google 인증 동의 관리 플랫폼(UMP)이 필요하다.
     *           영어 스토어 등록으로 해외 노출이 열리므로 정책 위반·광고 제한을 먼저 막는다.
     * 영향 범위: 배너·전면·리워드 전부. 동의가 필요 없는 지역(한국 등)은 폼 없이 통과하며,
     *           첫 실행에서만 동의 정보 조회(네트워크 1회)만큼 첫 광고가 늦어진다.
     *           동의 정보 조회 자체가 실패하면(콘솔 메시지 미설정·오프라인) 이전과 같이 광고를 요청한다.
     */
    fun gather(activity: Activity, onReady: (Context) -> Unit = {}) {
        val info = UserMessagingPlatform.getConsentInformation(activity)
        val appContext = activity.applicationContext
        info.requestConsentInfoUpdate(
            activity,
            ConsentRequestParameters.Builder().build(),
            {
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) { formError ->
                    if (formError != null) Log.d(TAG, "consent form: ${formError.message}")
                    privacyOptionsRequired = info.privacyOptionsRequirementStatus ==
                        ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED
                    if (info.canRequestAds()) initAds(appContext, onReady)
                }
            },
            { error ->
                // 콘솔에 동의 메시지가 없거나(Publisher misconfiguration) 네트워크 오류로 조회가 실패하면
                // 기존처럼 광고를 시작한다. 폼을 못 띄우는 상황이 광고 수익 전체를 막지 않게 한다.
                Log.d(TAG, "consent update failed: ${error.message}")
                initAds(appContext, onReady)
            }
        )
        // 이전 실행에서 이미 허용된 상태면 조회 응답을 기다리지 않고 바로 시작한다.
        if (info.canRequestAds()) initAds(appContext, onReady)
    }

    fun showPrivacyOptions(activity: Activity) {
        UserMessagingPlatform.showPrivacyOptionsForm(activity) { error ->
            if (error != null) Log.d(TAG, "privacy options: ${error.message}")
        }
    }

    private fun initAds(context: Context, onReady: (Context) -> Unit) {
        if (!initStarted.compareAndSet(false, true)) return
        MobileAds.initialize(context) {
            canRequestAds = true
            onReady(context)
        }
    }
}

/** 광고 동의 변경 진입점. 동의가 필요한 지역에서만 보인다. */
@Composable
fun PrivacyOptionsButton(modifier: Modifier = Modifier) {
    if (!AdsConsent.privacyOptionsRequired) return
    val activity = LocalContext.current as? Activity ?: return
    TextButton(onClick = { AdsConsent.showPrivacyOptions(activity) }, modifier = modifier) {
        Text(stringResource(R.string.privacy_options))
    }
}
