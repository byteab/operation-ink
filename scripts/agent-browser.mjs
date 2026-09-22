import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const configuredCli = process.env.AGENT_BROWSER_CLI
const localCli = join(process.cwd(), 'node_modules', '.bin', 'agent-browser')
const command = configuredCli ?? (existsSync(localCli) ? localCli : 'npx')
const executable = command.endsWith('.js') ? process.execPath : command
const commandArgs = command === 'npx'
  ? ['agent-browser']
  : command.endsWith('.js')
    ? [command]
    : []

export function runAgentBrowser(session, ...args) {
  return execFileSync(executable, [...commandArgs, '--session', session, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AGENT_BROWSER_SOCKET_DIR: process.env.AGENT_BROWSER_SOCKET_DIR ?? '/tmp/stickman-browser',
    },
    timeout: Number(process.env.AGENT_BROWSER_TIMEOUT_MS ?? 120000),
  }).trim()
}
