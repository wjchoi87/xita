import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

/*
 * Filesystem primitives for the canonical Markdown+YAML store (v0.4 §18-S4).
 * - ensureDir
 * - atomicWrite: temp 파일에 쓴 뒤 rename 으로 교체 (원자성, canonical mutation)
 */

export function ensureDirSync(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

export async function ensureDir(dir: string) {
  await fsp.mkdir(dir, { recursive: true })
}

export async function atomicWrite(filePath: string, content: string) {
  const dir = path.dirname(filePath)
  await ensureDir(dir)
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
  await fsp.writeFile(tmp, content, 'utf8')
  await fsp.rename(tmp, filePath)
}

export async function readText(filePath: string): Promise<string | null> {
  try {
    return await fsp.readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

export async function listFiles(dir: string, ext: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(ext))
      .map((e) => path.join(dir, e.name))
  } catch {
    return []
  }
}
