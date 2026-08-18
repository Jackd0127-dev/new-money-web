import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const aiInstructionRoot = join(process.cwd(), 'ai', 'instructions')

export function readAiInstruction(name: string): string {
  return readFileSync(join(aiInstructionRoot, name), 'utf8').trim()
}
