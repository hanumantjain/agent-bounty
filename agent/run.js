import { runAgent } from './lib/runAgent.js'

const IDENTITY = process.env.ENS_IDENTITY || 'researcher'

function logStep(step, data) {
  console.log(`→ ${step}`, Object.keys(data).length ? data : '')
}

async function main() {
  const result = await runAgent({ identity: IDENTITY, onStep: logStep })
  console.log('\n=== RESULT ===')
  console.log(JSON.stringify(result, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
}

main()
  .catch((err) => {
    console.error('✗ agent run failed:', err)
    process.exitCode = 1
  })
  .finally(() => process.exit(process.exitCode ?? 0))
