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
| 2 | Unauthorized agent fails | Live: `intern` identity never claims and never pays, bounty left fully untouched (`Open`, zero agent) — confirmed on real testnet after the Phase 11 claim step was added |
| 3 | Price below limit pays | Automated: `agent/test/decide.test.js` ("price below limit is allowed"); Live: `researcher` run above |
| 4 | Price above limit does not attempt payment | Automated: `agent/test/decide.test.js` ("price above limit is blocked"); Live: attack demo, Phase 8 — price spiked to 2 HBAR against `researcher`'s 1 HBAR limit, blocked before any claim, zero new transactions confirmed via mirror node |
| 5 | Unpaid API returns 402 | Automated: `backend/test/data.test.js` ("unpaid request returns 402 with payment requirements") |
| 6 | Invalid payment is rejected | Automated: `backend/test/data.test.js` (malformed `X-PAYMENT` header, and a well-formed-but-fake transaction rejected live by the real Blocky402 facilitator) |
| 7 | Live Graph failure fails safely | By construction: `backend/lib/graph.js` throws on any non-2xx/GraphQL-error response, and `backend/routes/data.js` converts that to a `502` — never falls back to stub/fake data (verified manually in Phase 2 by breaking `GRAPH_API_KEY`) |
| 8 | Correct answer pays | Live: independent check matched a genuine agent answer, a human approved via `POST /api/bounty/:taskId/decide` → status `Paid`, reward transferred (Phase 11) |
| 9 | Wrong answer does not pay | Live: a deliberately fabricated answer claimed + submitted directly → independent check flagged the mismatch (`matches: false`) → human rejected → status `Rejected`, reward untouched (Phase 11) |
| — | Exclusive claim (not in the guide's original list, added with the claim step) | Live: claiming the same bounty twice in immediate succession — the second `claimBounty` call reverts with `"not open"`, confirmed on real testnet (`contracts/scripts/testFlow.js`) |
| — | Task-type capability gate (not in the guide's original list, added with multi-task-type support) | Live: a bounty created with an unrecognized `taskType` (bypassing `POST /api/bounty/create`'s validation, directly via the contract) is discovered but never claimed — the agent stops at the capability check before any price probe, ENS lookup, or transaction; confirmed zero new transactions via mirror node. A second real task type (`deposit-anomaly`, querying the same subgraph's `deposits` entity) was run end-to-end and correctly flagged a genuine ~$40.1M outlier deposit as `SUSPICIOUS`, matched by the independent re-check, and approved |

## What's automated vs. what's live-verified

**Automated** (`npm test`, no network cost, safe to re-run anytime):
- `agent/test/decide.test.js` — spending-limit affordability logic, including exact-boundary cases.
- `agent/test/analyze.test.js` — anomaly-analysis verdict logic (shared by both task types), including empty-list and exact-threshold edge cases.
- `backend/test/data.test.js` — the paid endpoint's rejection paths (402 on no payment, rejection of a malformed header, and a live call to the real Blocky402 facilitator confirming it rejects a fabricated transaction).

**Live-verified, not re-run automatically** (would cost real testnet HBAR/gas or require live ENS/Graph state per run):
- Full agent runs (discovery → decide → claim → payment → data → analysis → submission) for both `researcher` and `intern`.
- The exclusive-claim guarantee (double `claimBounty` reverts).
- The human-review check/decide endpoints, both the approve and reject paths, against the real `BountyEscrow` contract.
- The price-spike attack scenario.

To re-verify any of these live paths yourself: `npm run agent:create-bounty`, then `npm run agent:start` (or `agent:start:blocked`). Once `Submitted`, either use the **Bounty Details** dashboard screen, or from `agent/`: `npm run verify -- <taskId>` (runs the check and acts on its own verdict immediately, for scripted testing).
