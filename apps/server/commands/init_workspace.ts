import { BaseCommand } from '@adonisjs/core/ace'
import { rebuildDerivedIndex } from '#v4/markdown_store'
import { ensureDir, atomicWrite } from '#v4/fs_util'
import path from 'node:path'
import { metaDir } from '#v4/workspace'
import { V4Domain } from '#v4/domain'
import { ArtifactStore, createDecision, createRelease } from '#v4/artifact_store'

/*
 * v0.4 부트스트랩: canonical Markdown+YAML workspace 를 초기화하고 데모 샘플을
 * 생성한다. Derived index 는 rebuildDerivedIndex() 로 구성. 사용법: node ace v4:init
 */
export default class InitWorkspace extends BaseCommand {
  static commandName = 'v4:init'
  static description = 'Initialize the v0.4 canonical Markdown+YAML workspace with a demo portfolio'

  static settings = { loadApp: true }

  async run() {
    await ensureDir(metaDir())
    await atomicWrite(
      path.join(metaDir(), 'workspace.json'),
      JSON.stringify({ workspace_revision: 0, last_updated: new Date().toISOString() }, null, 2)
    )

    const domain = new V4Domain()
    const artifacts = new ArtifactStore()

    // Products
    await domain.createProduct({
      name: 'Novel',
      description: '취향 기반 작품 추천을 제공하는 콘텐츠 플랫폼',
      productionStatus: 'PRODUCTION',
      version: 'v1.4.2',
      goal: 'AI 추천 기능 출시 및 구독 v2 계획',
      direction: '콘텐츠 추천 고도화 + 구독 매출 강화',
    })
    await domain.createProduct({
      name: 'PromptPick',
      description: '프롬프트 검증/공유 툴',
      productionStatus: 'BETA',
      version: 'v0.8',
      goal: '크리에이터 프로필 기능을 끝낸다',
      direction: '프롬프트 공유 커뮤니티로 확장',
    })

    // Novel changes
    await domain.createChange({
      productId: 'novel',
      title: 'AI Recommendation',
      intent: '취향 기반 추천 도입',
      goal: '추천 API/UI 출시',
      priority: 'high',
    })
    await domain.transitionChange('ai-recommendation', 'BUILD')
    await domain.transitionChange('ai-recommendation', 'REVIEW')
    await domain.createChange({
      productId: 'novel',
      title: 'Subscription v2',
      intent: '구독 요금제 개편',
      goal: '전환율 개선',
      priority: 'normal',
    })
    await domain.transitionChange('subscription-v2', 'PLAN')

    // PromptPick changes
    await domain.createChange({
      productId: 'promptpick',
      title: 'Creator Profile',
      intent: '크리에이터 공개 프로필',
      goal: '프로필 페이지 출시',
      priority: 'normal',
    })
    await domain.transitionChange('creator-profile', 'BUILD')

    // Workbench
    await domain.createWorkbench({
      title: 'Cold Start 개선',
      workType: 'research',
      summary: '신규 유저 추천 초기화 문제',
      body: '첫 진입 추천 마찰 조사',
    })
    await domain.createWorkbench({
      title: 'Pricing 실험',
      workType: 'experiment',
      summary: '구독 가격 민감도 A/B',
      body: '가격대별 전환 관측안',
    })

    // Living Artifact (rev1 + rev2)
    await artifacts.create({
      id: 'ai_rec_spec',
      name: 'AI 추천 스펙',
      product: 'novel',
      content: '# AI Recommendation\n\n- 취향 기반 추천\n- Fallback\n- Analytics',
      summary: '추천 스펙 v1',
    })
    await artifacts.addRevision('ai_rec_spec', {
      content:
        '# AI Recommendation v2\n\n- 취향 기반 추천 강화\n- Cold Start\n- Analytics\n- Error Handling',
      summary: 'Cold Start 반영',
      changeSummary: 'Cold Start 추가',
    })

    // Decision + Release
    await createDecision({
      id: 'payment_provider',
      product: 'novel',
      title: '결제 제공자',
      decision: 'Paddle 채택',
      reason: '수수료/글로벌 결제',
      options: ['Stripe', 'Paddle'],
      status: 'ACTIVE',
    })
    await createRelease({
      id: 'v1_5',
      product: 'novel',
      name: 'v1.5',
      status: 'PREPARING',
      notes: 'AI 추천 + 구독 v2',
    })

    const index = await rebuildDerivedIndex()
    // product 상태 투영을 위한 마지막 workspace revision 기록
    const metaFile = path.join(metaDir(), 'workspace.json')
    const fs = await import('node:fs/promises')
    const blob = await fs.readFile(metaFile, 'utf8')
    const meta = JSON.parse(blob.toString())
    meta.last_migration = 'v4:init'
    await atomicWrite(metaFile, JSON.stringify(meta, null, 2))

    this.logger.info(
      `canonical workspace initialized: workspace_revision=${index.workspace_revision} docs=${index.docs.length}`
    )
    this.logger.info('run `node ace serve --hmr` and use /api/v1/v4/* and /api/v1/sync/*')
  }
}
