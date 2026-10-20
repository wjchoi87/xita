package __PKG__.ads

import __PKG__.BuildConfig

/**
 * 광고 단위 ID.
 *
 * 설계 원칙:
 * - 디버그 빌드는 무조건 구글 공식 테스트 ID를 쓴다. 개발 중 자기 광고를 클릭해
 *   애드몹 계정이 정지되는 사고를 원천 차단한다.
 * - 실제 ID가 아직 비어 있으면 릴리즈 빌드에서도 테스트 ID로 폴백한다.
 *   잘못된 ID로 요청하다 계정에 흠집을 내는 것보다 낫다.
 *
 * 주의: 실제 ID가 빈 상태로 스토어에 올리면 광고 수익이 0이다.
 * 배포 전 반드시 REAL_* 값을 채울 것. (planner/docs/todo-owner.md 참조)
 */
object AdIds {

    // 애드몹 콘솔에서 발급받아 채운다. 비어 있으면 테스트 ID로 폴백.
    private const val REAL_BANNER = ""
    private const val REAL_INTERSTITIAL = ""
    private const val REAL_REWARDED = ""

    // 구글 공식 테스트 ID (고정값, 변경 금지)
    private const val TEST_BANNER = "ca-app-pub-3940256099942544/6300978111"
    private const val TEST_INTERSTITIAL = "ca-app-pub-3940256099942544/1033173712"
    private const val TEST_REWARDED = "ca-app-pub-3940256099942544/5224354917"

    val banner: String get() = pick(REAL_BANNER, TEST_BANNER)
    val interstitial: String get() = pick(REAL_INTERSTITIAL, TEST_INTERSTITIAL)
    val rewarded: String get() = pick(REAL_REWARDED, TEST_REWARDED)

    /** 실제 ID가 하나라도 비어 있는지. 배포 전 점검용. */
    val hasRealIds: Boolean
        get() = REAL_BANNER.isNotBlank() &&
            REAL_INTERSTITIAL.isNotBlank() &&
            REAL_REWARDED.isNotBlank()

    private fun pick(real: String, test: String): String =
        if (BuildConfig.DEBUG || real.isBlank()) test else real
}
