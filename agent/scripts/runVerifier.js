import { verifyBounty } from '../lib/verifier.js'

const taskId = process.argv[2]

function logStep(step, data) {
  console.log(`→ ${step}`, Object.keys(data).length ? data : '')
}

async function main() {
  if (!taskId) throw new Error('usage: node scripts/runVerifier.js <taskId>')
  const result = await verifyBounty({ taskId, onStep: logStep })
  console.log('\n=== RESULT ===')
  console.log(JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error('✗ verification failed:', err)
  process.exit(1)
})
