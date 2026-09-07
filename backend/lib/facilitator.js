const FACILITATOR_URL = process.env.BLOCKY402_FACILITATOR_URL

let supportedCache = null

async function getSupported() {
  if (supportedCache) return supportedCache
  const res = await fetch(`${FACILITATOR_URL}/supported`)
  if (!res.ok) throw new Error(`facilitator /supported failed: ${res.status}`)
  supportedCache = await res.json()
  return supportedCache
}

async function getFeePayer(network) {
  const supported = await getSupported()
  const kind = supported.kinds.find((k) => k.network === network)
  if (!kind?.extra?.feePayer) {
    throw new Error(`facilitator has no feePayer for network ${network}`)
  }
  return kind.extra.feePayer
}

async function verify(paymentPayload, paymentRequirements) {
  const res = await fetch(`${FACILITATOR_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements }),
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text }
  }
  if (!res.ok || !body.isValid) {
    throw new Error(`payment verify failed: ${body.invalidReason || body.raw || res.status}`)
  }
  return body
}

async function settle(paymentPayload, paymentRequirements) {
  const res = await fetch(`${FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements }),
  })
  const body = await res.json()
  if (!res.ok || !body.success) {
    throw new Error(`payment settle failed: ${body.errorReason || res.status}`)
  }
  return body
}

module.exports = { getSupported, getFeePayer, verify, settle }
