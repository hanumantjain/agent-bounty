const TINYBARS_PER_HBAR = 100_000_000

export function checkAffordability({ priceTinybars, limitHbar }) {
  const priceHbar = Number(priceTinybars) / TINYBARS_PER_HBAR
  return { allowed: priceHbar <= limitHbar, priceHbar, limitHbar }
}
