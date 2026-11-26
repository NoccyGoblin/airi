import type { Tool } from '@xsai/shared-chat'

import { withOwnerNotes } from '../../../bridges/mid-job'

/**
 * FAIRY: wraps PC tools, so each result also carries what the owner said while the job ran.
 * See `src/renderer/bridges/mid-job.ts`.
 */
export function carryOwnerNotes(tools: Tool[]): Tool[] {
  return tools.map(tool => ({
    ...tool,
    execute: async (input, options) => {
      const result = await tool.execute(input, options)
      return withOwnerNotes(typeof result === 'string' ? result : JSON.stringify(result))
    },
  }))
}
