/** Loopback-only Xiaocong project, document, trash and proposal HTTP endpoints. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { XiaocongFileError, XiaocongFiles } from './xiaocong-files.ts'
import { XiaocongProposals } from './xiaocong-proposals.ts'

/** Default projects directory beside the source checkout or installed runtime. */
export const AIPM_PRODUCT_ROOT = fileURLToPath(new URL('../../../../projects', import.meta.url))
/** Exact endpoint list registered on the Host. */
export const XIAOCONG_ROUTES = ['/aipm/product', '/aipm/projects', '/aipm/file', '/aipm/stage', '/aipm/state', '/aipm/mutate', '/aipm/decide', '/aipm/search']

/**
 * Validate a project or document path component.
 * @param value - legacy path name.
 * @returns a safe single component, or empty.
 */
export function sanitizeSegment(value: string): string {
  const cleaned = value.replace(/[\\/:\0]/gu, ' ').replace(/\s+/gu, ' ').trim()
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? '' : cleaned.slice(0, 80)
}
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    bytes += buffer.length
    if (bytes > 2_100_000) throw new XiaocongFileError('unsupportedFile', 413)
    chunks.push(buffer)
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new XiaocongFileError('invalidData')
  return value as Record<string, unknown>
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new XiaocongFileError('invalidData')
  return value
}
function localRequest(req: IncomingMessage): boolean {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) return false
  const origin = req.headers.origin
  if (origin === undefined) return req.headers['sec-fetch-site'] !== 'cross-site'
  if (origin === 'dsh-app://app') return true
  try { const url = new URL(origin); return url.host === req.headers.host && ['http:', 'https:'].includes(url.protocol) }
  catch (error: unknown) { void error; return false }
}
/**
 * Handle local workbench routes and return structured errors.
 * @param req - local HTTP request.
 * @param res - response.
 * @param workbench - filesystem and proposal owners for this runtime.
 * @returns whether a Xiaocong endpoint answered.
 */
export async function handleAipmRequest(
  req: IncomingMessage, res: ServerResponse, workbench: { files: XiaocongFiles; proposals: XiaocongProposals },
): Promise<boolean> {
  const { files: xiaocongFiles, proposals: xiaocongProposals } = workbench
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (!XIAOCONG_ROUTES.includes(url.pathname)) return false
  if (!localRequest(req)) { sendJson(res, 403, { error: 'localOnly' }); return true }
  try {
    if (req.method === 'GET') {
      if (url.pathname === '/aipm/projects') sendJson(res, 200, { projects: await xiaocongFiles.projects() })
      else if (url.pathname === '/aipm/state') sendJson(res, 200, {
        root: xiaocongFiles.root, projects: await xiaocongFiles.projects(),
        trash: await xiaocongFiles.trashList(), proposals: await xiaocongProposals.list(),
      })
      else if (url.pathname === '/aipm/search') {
        const phrase = (url.searchParams.get('query') ?? '').trim().toLocaleLowerCase()
        const items: { project: string; file: string }[] = []
        if (phrase) for (const project of await xiaocongFiles.projects()) {
          for (const file of project.documents) {
            const content = await xiaocongFiles.read(project.name, file)
            if (`${file} ${content.markdown}`.toLocaleLowerCase().includes(phrase)) items.push({ project: project.name, file })
          }
        }
        sendJson(res, 200, { items })
      }
      else if (url.pathname === '/aipm/file') sendJson(res, 200, await xiaocongFiles.read(url.searchParams.get('project') ?? '', url.searchParams.get('file') ?? ''))
      else if (url.pathname === '/aipm/product') {
        const name = url.searchParams.get('name') ?? ''
        const project = (await xiaocongFiles.projects()).find(item => item.name === name)
        if (project === undefined) throw new XiaocongFileError('missing', 404)
        sendJson(res, 200, { outputs: project.documents })
      } else sendJson(res, 405, { error: 'method' })
      return true
    }
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'method' }); return true }
    const data = await body(req)
    if (url.pathname === '/aipm/projects') sendJson(res, 201, await xiaocongFiles.create(data.name))
    else if (url.pathname === '/aipm/decide') {
      if (typeof data.allow !== 'boolean') throw new XiaocongFileError('invalidData')
      await xiaocongProposals.decide(string(data.id), data.allow)
      sendJson(res, 200, { ok: true })
    } else if (url.pathname === '/aipm/mutate') {
      const op = string(data.op)
      if (op === 'restore' || op === 'purge') await xiaocongFiles.restore(string(data.id), data.version, op === 'purge')
      else if (op === 'rename') await xiaocongFiles.rename(string(data.project), string(data.file), string(data.name), data.version)
      else if (op === 'trash') await xiaocongFiles.trash(string(data.project), string(data.file), data.version)
      else if (op === 'save') await xiaocongFiles.save(string(data.project), string(data.file), string(data.markdown), data.version)
      else throw new XiaocongFileError('invalidData')
      sendJson(res, 200, { ok: true })
    } else if (url.pathname === '/aipm/stage') {
      const fileName = `${sanitizeSegment(string(data.stageTitle))}.md`
      await xiaocongFiles.save(string(data.productName), fileName, string(data.markdown), data.version ?? null)
      sendJson(res, 200, { fileName })
    } else sendJson(res, 405, { error: 'method' })
  } catch (error: unknown) {
    const code = error instanceof XiaocongFileError ? error.code : error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 'missing' : 'io'
    sendJson(res, error instanceof XiaocongFileError ? error.status : code === 'missing' ? 404 : 400, { error: code })
  }
  return true
}
