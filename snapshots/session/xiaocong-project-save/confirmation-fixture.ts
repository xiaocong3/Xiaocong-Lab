/** Deterministic user confirmation for a recorded Xiaocong tool proposal. */
import type { Context } from '@deepseek-ai/cordis'
import { basename, dirname } from 'node:path'
import { XiaocongFiles } from '../../../packages/bundle/web-app/src/xiaocong-files.ts'
import { XiaocongProposals, installXiaocongProposals } from '../../../packages/bundle/web-app/src/xiaocong-proposals.ts'

/**
 * Install deterministic user confirmation for this snapshot fixture.
 * @param ctx - shipped profile context; the fixture alone supplies the user's affirmative decision.
 */
export function apply(ctx: Context): void {
  const cwd = process.cwd()
  const proposals = new XiaocongProposals(new XiaocongFiles(dirname(cwd)))
  installXiaocongProposals(ctx, proposals)
  ctx.effect(() => {
    let running = false
    const timer = setInterval(() => {
      if (running) return
      running = true
      void proposals.list().then(async items => {
        const pending = items.find(item => item.project === basename(cwd) && item.status === 'pending')
        if (pending !== undefined) await proposals.decide(pending.id, true)
      }).catch((error: unknown) => { console.warn('Xiaocong fixture confirmation:', error) }).finally(() => { running = false })
    }, 100)
    return () => { clearInterval(timer) }
  }, 'Xiaocong fixture: deterministic confirmation')
}
