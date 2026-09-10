import { createAuditTopic } from '../lib/hcsAudit.js'

createAuditTopic()
  .then((topicId) => {
    console.log(`Created HCS audit topic: ${topicId}`)
    console.log(`Add to agent/.env: HCS_AUDIT_TOPIC_ID=${topicId}`)
  })
  .catch((err) => {
    console.error('failed to create HCS audit topic:', err)
    process.exit(1)
  })
