import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import fs from 'node:fs/promises'
import path from 'node:path'

/*
 * 웹 콘솔 정적 서빙 (public/app/*). 빌드 단계 없는 vanilla ES modules.
 * @adonisjs/static 을 들이는 대신 파일 몇 개라 직접 서빙 — 경로 탈출은 root 비교로 차단.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
}

export default class ConsoleController {
  async root({ request, response }: HttpContext) {
    // 브라우저 주소창 진입(sec-fetch-dest=document)은 콘솔로, JSON 클라이언트는 기존 health 응답 유지.
    // (force_json 미들웨어가 Accept 를 application/json 으로 덮어써서 Accept 로는 구분 불가)
    if (request.header('sec-fetch-dest') === 'document') return response.redirect('/app/')
    return { service: 'xita', protocol: 'v4', status: 'ok', console: '/app/' }
  }

  /** `/app` → `/app/` (상대 경로 기준 통일). 라우터가 끝 슬래시를 정규화하므로 원본 URL 로 판단. */
  async entry(ctx: HttpContext) {
    if (!ctx.request.request.url?.split('?')[0].endsWith('/')) return ctx.response.redirect('/app/')
    return this.asset(ctx)
  }

  async asset({ params, response }: HttpContext) {
    const root = app.makePath('public', 'app')
    const rel = (params['*'] as string[] | undefined)?.join('/') || 'index.html'
    const file = path.resolve(root, rel)
    if (file !== root && !file.startsWith(root + path.sep))
      return response.notFound({ error: 'not found' })
    try {
      const body = await fs.readFile(file)
      response.header('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream')
      response.header('cache-control', 'no-store')
      return response.send(body)
    } catch {
      // SPA: 알 수 없는 경로는 index.html (hash 라우팅이라 거의 안 탐)
      if (path.extname(rel)) return response.notFound({ error: 'not found' })
      response.header('content-type', TYPES['.html'])
      return response.send(await fs.readFile(path.join(root, 'index.html')))
    }
  }
}
