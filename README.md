# AgentBounty

### An autonomous AI agent that discovers paid work, pays for the data it needs, and earns an on-chain HBAR reward — with ENSv2 controlling what it's allowed to spend.

AgentBounty is a permissioned labor market for AI agents. A creator posts a bounty funded with HBAR. An agent discovers it, resolves its ENSv2 identity and spending policy on Sepolia, pays for live blockchain data through a Hedera x402-gated service (settled by the Blocky402 facilitator) only if the price is within its authorized limit, analyzes the data using a live subgraph on The Graph, submits its answer on-chain, and gets paid only after an independent verifier re-checks the answer against fresh data.

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

The paid endpoint and the independent verifier both query a live, actively-syncing Messari-standardized lending subgraph for real recent `withdraws` events. The agent's "suspicious activity" analysis runs on whatever that query returns *right now* — not a fixture. The verifier re-runs the same query independently before releasing any reward, so a stale or fabricated answer is caught.

### 3. Hedera — Machine Payments & Settlement

The data endpoint is gated by a real HTTP 402 flow, settled through the **Blocky402** x402 facilitator on Hedera testnet. The agent builds and signs a real `TransferTransaction`, the facilitator verifies and settles it, and the bounty itself is a small Solidity escrow contract deployed on Hedera testnet (compiled with `solc`, deployed via `viem` against Hedera's JSON-RPC relay) that funds, tracks submissions, and pays out HBAR on independent verification.

---

## How It Works

1. Agent discovers an open bounty from the escrow contract's event log
2. Resolves its ENSv2 identity and spending policy on Sepolia
3. Checks its spending limit against the data service's live price
4. Requests paid data → receives HTTP `402 Payment Required`
5. Pays via Hedera x402 through Blocky402 — **only if price ≤ spending limit**, otherwise it stops before any funds move
6. Retrieves live withdrawal data from The Graph
7. Analyzes the data and flags anomalies (e.g. an unusually large withdrawal)
8. Submits its answer on-chain to the bounty escrow contract
9. An independent verifier re-queries The Graph itself, re-runs the analysis, and compares it against the submitted answer
10. The bounty (HBAR) is released on-chain **only if the answer checks out** — a fabricated or wrong answer gets the reward withheld

If a data service's price exceeds the agent's authorized limit — even for an otherwise fully-trusted identity — the payment is blocked and the agent stops. No funds move, no data is purchased, no submission is made. See it live on the **Live Execution** dashboard screen.

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

`agent/` is the autonomous agent itself: it holds the Hedera and ENS keys, orchestrates the discover → pay → analyze → submit flow, and independently verifies bounty answers. It runs both as a standalone CLI and as the engine behind the backend's live-execution SSE stream.

The bounty escrow smart contract stays intentionally small:

```solidity
createBounty(bytes32 taskId, string description) payable
submitAnswer(bytes32 taskId, bytes answer)
releaseReward(bytes32 taskId, bool verified)   // verifier-only
```

The agent's reasoning stays off-chain; only the economic settlement (bounty creation, submission, reward release) happens on-chain.

---

## Live, verifiable proof

Everything below is checkable independently — nothing here is asserted, it's all on public testnets.

| Component | Where to verify |
|---|---|
| Bounty escrow contract | [`0.0.10426327`](https://hashscan.io/testnet/contract/0xb2153e4f1645753b125a62fc83ea72e523773493) on Hedera testnet |
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
- **Verifiable work** — an agent is never trusted to declare its own success; an independent verifier re-derives the answer from fresh data before any reward moves.
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
npm run agent:start           # researcher identity — pays, analyzes, submits
npm run agent:start:blocked   # intern identity — blocked before any payment
```

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
