# AgentBounty

### An autonomous AI agent that discovers paid work, pays for the data it needs, and earns an on-chain HBAR reward — with ENSv2 controlling what it's allowed to spend.

AgentBounty is a permissioned labor market for AI agents. Creators post bounties funded with HBAR — many can be open at once. An agent discovers all of them, resolves its ENSv2 identity and spending policy on Sepolia, and works through the open candidates deciding whether it can do each one — does it recognize the task type, and is the price within its authorized limit — skipping any it can't, until it finds one it can. It then claims that bounty on-chain (so no other agent can also claim it), pays for live blockchain data through a Hedera x402-gated service (settled by the Blocky402 facilitator), analyzes the data using a live subgraph on The Graph, and submits its answer on-chain. A human then reviews it — an independent check re-derives the answer from fresh data as evidence — before approving or rejecting the payout.

> **Agents shouldn't need unrestricted wallets to participate in an economy. They should have identities, permissions, and controlled spending.**

Every part of this is real and running on testnets — no mocked data, no simulated payments, no hardcoded contract addresses. See [Live, verifiable proof](#live-verifiable-proof) below.

---

## Why AgentBounty?

AI agents are becoming capable of performing real work, but autonomous agent-to-agent commerce has a basic problem:

**How can an agent safely spend money to complete a task?**

Today, an agent may need API keys, subscriptions, manually funded wallets, unrestricted private keys, centralized payment accounts, or trusted intermediaries.

AgentBounty demonstrates another model: the agent is not simply given money and told to spend it. **It has an identity, a spending boundary, and a reason for every payment.**

---

## Core Technologies

### 1. ENSv2 — Agent Identity & Permissions (Sepolia)

Each agent identity is a real ENSv2 subname (`researcher.<parent>.eth`, `intern.<parent>.eth`) under a **self-deployed subname registry** — not the default registry, but one we own and control, deployed via ENSv2's `VerifiableFactory` + `UserRegistryImpl` proxy pattern. Each subname has its own dedicated **Permissioned Resolver**, and the `agent.spending.limit` text record is protected by a **key-scoped Enhanced Access Control role** (`authorizeTextRoles`) — an account can be granted permission to edit *only that one record*, not the whole name. The agent reads its limit at runtime through the standard `UniversalResolverV2` resolution path. ENSv2 is not a username here — it's the authorization gate a real Hedera payment cannot bypass.

### 2. The Graph — Live Blockchain Intelligence

The paid endpoint and the independent check both query a live, actively-syncing Messari-standardized lending subgraph — for `withdraws` or `deposits` events, depending on the bounty's task type. The agent's "suspicious activity" analysis runs on whatever that query returns *right now* — not a fixture. Before any reward is released, the same query is re-run independently and shown to a human next to the agent's submitted answer, so a stale or fabricated answer is visibly caught rather than trusted.

### 3. Hedera — Machine Payments & Settlement

The data endpoint is gated by a real HTTP 402 flow, settled through the **Blocky402** x402 facilitator on Hedera testnet. The agent builds and signs a real `TransferTransaction`, the facilitator verifies and settles it, and the bounty itself is a small Solidity escrow contract deployed on Hedera testnet (compiled with `solc`, deployed via `viem` against Hedera's JSON-RPC relay) that funds, tracks submissions, and pays out HBAR on independent verification.

---

## How It Works

1. Human creators post bounties, each funded with HBAR, to the escrow contract — picking a **task type** from the agent's own capability registry (currently: detecting suspicious withdrawals, or unusually large deposits). Many can be open at once
2. An agent discovers every currently-open bounty from the contract's event log
3. It resolves its ENSv2 identity and spending policy on Sepolia once, then works through the open candidates in order, deciding per bounty whether it can do the work: does it recognize the task type, and is the price within its spending limit? An unrecognized type or an over-budget price is skipped outright — no claim, no transaction for that candidate — and it moves on to the next one
4. Once it finds one it can do: it claims that bounty on-chain (`claimBounty`) — an atomic, real transaction, so a second agent can't also claim and submit against the same bounty (and if another agent claims it first in the meantime, the claim reverts and the agent moves on to the next candidate instead)
5. It requests the paid data → receives HTTP `402 Payment Required`
6. Pays via Hedera x402 through Blocky402 — only reachable because the affordability check already passed for this bounty
7. Retrieves live data from The Graph for that task's entity (withdrawals or deposits) and analyzes it, flagging anomalies (e.g. an unusually large amount)
8. Submits its answer on-chain (`submitAnswer`) — only the identity that claimed the bounty can do this
9. A human reviews it on the **Bounty Details** screen: an independent check re-queries The Graph itself, re-runs the analysis, and shows the fresh result next to the submitted one
10. The human approves or rejects — the reward is released on-chain **only on approval**; a fabricated or wrong answer is visibly caught by the independent check before that decision is made

If every open bounty is either priced above the agent's authorized limit or an unrecognized task type — even for an otherwise fully-trusted identity — it never claims anything, and no payment is ever attempted. No funds move, no data is purchased, no submission is made; the step log shows exactly why each candidate was skipped. See it live on the **Live Execution** dashboard screen.

### Or: activate a bounty and let agents race for it

Any **Open** bounty's Details page has an **Activate Bounty** button — an alternate, competitive path to the same flow above. Every configured identity attempts to claim that one bounty at once; the contract's exclusive `claimBounty` guarantees only one transaction actually succeeds, so whichever identity is both eligible (recognizes the task, within its spending limit) and fastest wins. The loser(s) are left exactly as they started — no funds spent, confirmed via the live step log showing why each one didn't win. The winner pays, works, and submits exactly as above, but the reward is **auto-verified and released immediately** — no human click — since a race is meant to resolve on its own. The manual human-review path (step 9–10 above) still applies to every bounty worked through the ordinary "Run Agent" flow instead.

---

## Architecture

```text
                   ┌───────────────┐
                   │   Frontend    │
                   │ React / Vite  │
                   │  (dashboard)  │
                   └───────┬───────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │    Backend      │
                  │ Express (x402   │
                  │ endpoint + SSE) │
                  └───────┬─────────┘
                          │
             ┌────────────┼──────────────┐
             │            │              │
             ▼            ▼              ▼
        ┌────────┐   ┌─────────┐   ┌───────────┐
        │ ENSv2  │   │The Graph│   │  Hedera   │
        │Sepolia │   │ Subgraph│   │  x402 /   │
        │Identity│   │  Query  │   │ Blocky402 │
        └────────┘   └─────────┘   └─────┬─────┘
                                          │
                                          ▼
                                  ┌───────────────┐
                                  │ BountyEscrow  │
                                  │  (Hedera EVM) │
                                  └───────────────┘
```

`agent/` is the autonomous agent itself: it holds the Hedera and ENS keys, orchestrates the discover → decide → claim → pay → analyze → submit flow, and provides the independent-check logic a human reviews before approving payout. It runs both as a standalone CLI and as the engine behind the backend's live-execution SSE stream.

The bounty escrow smart contract stays intentionally small:

```solidity
createBounty(bytes32 taskId, string description, string taskType) payable
claimBounty(bytes32 taskId)                          // agent-only, atomic — blocks a second claim
submitAnswer(bytes32 taskId, bytes answer)           // only the claimant
releaseReward(bytes32 taskId, bool approved)         // verifier-key-gated, called after human review
```

The agent's reasoning stays off-chain; only the economic settlement (bounty creation, claim, submission, reward release) happens on-chain.

---

## Live, verifiable proof

Everything below is checkable independently — nothing here is asserted, it's all on public testnets.

| Component | Where to verify |
|---|---|
| Bounty escrow contract | [`0.0.10436913`](https://hashscan.io/testnet/contract/0xa864c2893facdcd54c3fea3bc547da33f5e546d0) on Hedera testnet |
| Blocky402 facilitator | `https://api.testnet.blocky402.com` (Hedera x402 facilitator) |
| ENSv2 subname registry (self-deployed) | [`0x7faaa41e9154055e6a988eadc857ccbd41f864c8`](https://sepolia.etherscan.io/address/0x7faaa41e9154055e6a988eadc857ccbd41f864c8) on Sepolia |
| Live subgraph queried | [`FKe6ANnWmGPE6hajGLoTgPrVF2jYPHiRu2Jwcg9ZmG9A`](https://thegraph.com/explorer/subgraphs/FKe6ANnWmGPE6hajGLoTgPrVF2jYPHiRu2Jwcg9ZmG9A) on The Graph Explorer |

Run the agent yourself (see [SETUP.md](./SETUP.md)) and every step — the 402, the signed Hedera transaction, the live Graph response, the on-chain submission, the verifier's independent re-check, the reward release — produces a real transaction hash you can look up.

---

## Repository structure

```text
agentbounty/
├── backend/          Express API: x402-gated data endpoint, bounty/identity routes, SSE agent runner
├── frontend/         React + Vite dashboard (Tailwind CSS)
├── agent/            The autonomous agent: Hedera + ENS clients, orchestrator, verifier, CLI scripts
├── contracts/        BountyEscrow.sol + compile/deploy/test scripts (solc + viem, no framework)
├── SETUP.md          Credential/setup steps
└── TESTING.md        What's automated vs. live-verified, and how to re-check it yourself
```

---

## Security Principles

- **Least privilege** — agents only receive the permissions they need.
- **Bounded spending** — an agent never has unlimited purchasing power, enforced by a real on-chain-readable policy, not application logic alone.
- **Verifiable work** — an agent is never trusted to declare its own success; an independent, automated re-check re-derives the answer from fresh data as evidence, and a human makes the final call before any reward moves.
- **Exclusive claims** — a bounty can only be claimed by one agent at a time, atomically enforced on-chain, so two agents can't both do (and get paid for) the same work.
- **On-chain settlement** — payments and rewards have independently verifiable transaction records.

---

## Local Development

See **[SETUP.md](./SETUP.md)** for the full credential setup (Hedera testnet account, Sepolia wallet, Graph API key).

```bash
git clone https://github.com/hanumantjain/agent-bounty.git
cd agent-bounty
npm install
```

Start the backend and frontend:

```bash
npm run dev:backend
npm run dev:frontend
```

Run the agent directly (after setup):

```bash
npm run agent:create-bounty   # creator posts a bounty
npm run agent:start           # researcher identity — decides, claims, pays, analyzes, submits
npm run agent:start:blocked   # intern identity — never claims; blocked before any payment
```

The bounty then sits at `Submitted` until a human reviews it — either via the **Bounty Details** dashboard screen (Check answer → Approve/Reject) or `agent/scripts/runVerifier.js <taskId>`, which runs the same independent check and acts on its own verdict immediately (useful for scripted testing).

Run tests: `npm test` (see [TESTING.md](./TESTING.md) for coverage details).

---

## Built With

- ENSv2 (Sepolia beta)
- The Graph
- Hedera (testnet, x402 via Blocky402)
- Solidity (compiled with `solc`, deployed via `viem`)
- TypeScript / React / Tailwind CSS
- Node.js / Express
- viem, @hashgraph/sdk

## Status

🚧 Hackathon MVP — fully functional on testnet (Hedera testnet + Sepolia). One creator, one bounty, one agent, one verifier — intentionally small scope, real end-to-end execution.

## License

MIT
