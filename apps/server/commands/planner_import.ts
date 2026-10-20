import { BaseCommand, flags } from '@adonisjs/core/ace'
import { importPlanner } from '#portfolio/planner_import'

/*
 * planner → XITA 흡수 (docs/PORTFOLIO.md §6). 재실행 안전.
 * 사용법: node ace planner:import [--from <planner dir>] [--dry-run]
 */
export default class PlannerImport extends BaseCommand {
  static commandName = 'planner:import'
  static description =
    'Absorb ~/workspace/auto-money/planner (registry, docs, logs, raw archive) into the XITA workspace'

  static settings = { loadApp: true }

  @flags.string({ description: 'planner directory (default: $XITA_PORTFOLIO_ROOT/planner)' })
  declare from: string

  @flags.boolean({ description: 'preview only — write nothing' })
  declare dryRun: boolean

  async run() {
    const report = await importPlanner({ from: this.from, dryRun: this.dryRun })
    const count = (xs: Array<{ action: string }>) =>
      xs.reduce<Record<string, number>>((m, x) => ((m[x.action] = (m[x.action] ?? 0) + 1), m), {})
    this.logger.info(`${report.dryRun ? '[미리보기] ' : ''}${report.from} → ${report.workspace}`)
    this.logger.info(
      `원문 보관: ${report.archive.files}개 파일 (${(report.archive.bytes / 1024).toFixed(0)} KB) ${report.archive.reused ? '— 동일 스냅샷 재사용' : ''} ${report.archive.dir}`
    )
    this.logger.info(
      `비밀 파일 제외(복사 안 함): ${report.archive.excludedSecrets.join(', ') || '-'}`
    )
    this.logger.info(`프로젝트: ${JSON.stringify(count(report.projects))}`)
    this.logger.info(`문서: ${JSON.stringify(count(report.artifacts))}`)
    this.logger.info(`앱 기록: 이관 ${report.logs.imported} / 이미 있음 ${report.logs.skipped}`)
    for (const w of report.warnings) this.logger.warning(w)
  }
}
