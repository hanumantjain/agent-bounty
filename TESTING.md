# Testing

Automated tests cover the deterministic logic and the backend's payment-rejection paths.
The full paid/on-chain flows are exercised against real Hedera + Sepolia testnet — re-running
those on every test invocation would cost real (testnet) funds and gas on every run, so those
behaviors are verified live and the evidence is recorded here instead of re-asserted automatically.

Run automated tests: `npm test` from the repo root (runs `agent/` and `backend/` test suites).

## Guide's test checklist

| # | Scenario | Coverage |
|---|---|---|
| 1 | Authorized agent passes | Live: `researcher` identity completes a real bounty end-to-end (Phase 5 commit `d5e04a8`) |
| 2 | Unauthorized agent fails | Live: `intern` identity blocked pre-payment, zero Hedera transactions (Phase 3 commit `b0eb059`, Phase 5 commit `d5e04a8`) |
| 3 | Price below limit pays | Automated: `agent/test/decide.test.js` ("price below limit is allowed"); Live: `researcher` run above |
| 4 | Price above limit does not attempt payment | Automated: `agent/test/decide.test.js` ("price above limit is blocked"); Live: attack demo, Phase 8 — price spiked to 2 HBAR against `researcher`'s 1 HBAR limit, blocked, zero new transactions confirmed via mirror node |
| 5 | Unpaid API returns 402 | Automated: `backend/test/data.test.js` ("unpaid request returns 402 with payment requirements") |
| 6 | Invalid payment is rejected | Automated: `backend/test/data.test.js` (malformed `X-PAYMENT` header, and a well-formed-but-fake transaction rejected live by the real Blocky402 facilitator) |
| 7 | Live Graph failure fails safely | By construction: `backend/lib/graph.js` throws on any non-2xx/GraphQL-error response, and `backend/routes/data.js` converts that to a `502` — never falls back to stub/fake data (verified manually in Phase 2 by breaking `GRAPH_API_KEY`) |
| 8 | Correct answer pays | Live: `agent/lib/verifier.js` re-check matched a genuine agent answer → `releaseReward(true)` → status `Paid` (Phase 6 commit `00a011b`) |
| 9 | Wrong answer does not pay | Live: a deliberately fabricated answer submitted directly → verifier's independent re-check caught the mismatch → `releaseReward(false)` → status `Rejected`, reward untouched (Phase 6 commit `00a011b`) |

## What's automated vs. what's live-verified

**Automated** (`npm test`, no network cost, safe to re-run anytime):
- `agent/test/decide.test.js` — spending-limit affordability logic, including exact-boundary cases.
- `agent/test/analyze.test.js` — withdrawal-analysis verdict logic, including empty-list and exact-threshold edge cases.
- `backend/test/data.test.js` — the paid endpoint's rejection paths (402 on no payment, rejection of a malformed header, and a live call to the real Blocky402 facilitator confirming it rejects a fabricated transaction).

**Live-verified, not re-run automatically** (would cost real testnet HBAR/gas or require live ENS/Graph state per run):
- Full agent runs (discovery → ENS → payment → data → analysis → submission) for both `researcher` and `intern`.
- The independent verifier's release/reject paths against the real `BountyEscrow` contract.
- The price-spike attack scenario.

To re-verify any of these live paths yourself: `npm run agent:create-bounty`, then `npm run agent:start` (or `agent:start:blocked`), then from `agent/`: `npm run verify -- <taskId>`.
