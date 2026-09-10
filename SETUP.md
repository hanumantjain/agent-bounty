# Setup

Everything here is scriptable — no manual UI registration is required anywhere, including for ENSv2 (the setup script registers your name and subnames directly against the real ENSv2 Sepolia beta contracts).

## Prerequisites

- Node.js 22+ (uses `node --env-file`, no `dotenv` dependency)
- npm

## 1. Get two funded accounts

You need credentials for two separate networks — they're unrelated to each other.

**Hedera testnet account** (for x402 payments and the bounty contract):
1. Create an account at [portal.hedera.com](https://portal.hedera.com) — choose **ECDSA** key type (an ECDSA Hedera key doubles as a standard EVM account, which the bounty contract and ENS setup scripts also need).
2. Fund it via the portal's built-in faucet (1000 HBAR/24h).
3. Note the Account ID (`0.0.x`) and the raw private key.
4. Create a **second** Hedera account the same way — this is the `payTo` account the backend receives payments into. Fund it too (a small amount is enough).

**Sepolia wallet** (for ENSv2 setup):
1. Any EVM wallet (e.g. MetaMask) works — export its private key.
2. Get free Sepolia ETH from any faucet (Google Cloud, Alchemy, QuickNode all have one) — you only need enough for gas. No testnet-USDC faucet is needed: the ENSv2 beta's registration payment token (`MockUSDC`) has a public `mint()` function, and the setup script mints its own.

## 2. Get a Graph Studio API key and pick a live subgraph

1. Create a free API key at [thegraph.com/studio/apikeys](https://thegraph.com/studio/apikeys).
2. Pick a live, actively-syncing Messari-standardized **lending** subgraph (only lending-schema subgraphs have the `withdraws` entity this project queries) via [Graph Explorer](https://thegraph.com/explorer) — search "messari" + a protocol (Aave, Compound, Morpho, Spark) and confirm it shows **Synced**, not **Deprecated**. Note its subgraph ID.
   - You can reuse the one this project already verified live: `FKe6ANnWmGPE6hajGLoTgPrVF2jYPHiRu2Jwcg9ZmG9A` — but subgraphs can go stale over time, so it's worth spot-checking it's still syncing.

## 3. Configure environment files

Copy each `.env.example` to `.env` and fill in the real values (all three files are git-ignored):

```bash
cp backend/.env.example backend/.env
cp agent/.env.example agent/.env
cp contracts/.env.example contracts/.env
```

**`backend/.env`**
- `HEDERA_PAY_TO_ACCOUNT_ID` — your second Hedera account (the one receiving payments)
- `GRAPH_API_KEY`, `GRAPH_SUBGRAPH_ID` — from step 2
- Everything else can stay at its default

**`agent/.env`**
- `AGENT_HEDERA_ACCOUNT_ID`, `AGENT_HEDERA_PRIVATE_KEY` — your first Hedera account (the payer)
- `ENS_ADMIN_PRIVATE_KEY` — your Sepolia wallet's private key
- `ENS_PARENT_LABEL` — a unique label you want to register, e.g. `agentbounty-yourname` (no `.eth` suffix)
- `GRAPH_API_KEY`, `GRAPH_SUBGRAPH_ID` — same as backend, used by the independent verifier
- `BOUNTY_CONTRACT_ADDRESS` — leave blank until step 5

**`contracts/.env`**
- `DEPLOYER_PRIVATE_KEY` — reuse your Hedera account's private key from `agent/.env`
- `VERIFIER_ADDRESS` — leave blank to default to the deployer's own address (fine for a single-operator demo; the contract already supports a distinct verifier account if you want to split the role later)

**Never** paste any private key into a chat/AI session — edit the `.env` files directly.

## 4. Register your ENS identities on Sepolia

This deploys your own ENSv2 subname registry, registers your parent name, creates two subnames (`researcher`, `intern`), gives each its own Permissioned Resolver, and sets the `agent.spending.limit` text record on each via a key-scoped Enhanced Access Control grant — all in one script, no faucet or UI needed beyond the Sepolia ETH you already have.

```bash
cd agent
npm install
npm run setup-ens
```

This takes a few minutes (there's a ~70 second commit-reveal wait built into ENS registration). It prints a transaction hash at every step — each one is checkable on Sepolia Etherscan.

## 5. Deploy the bounty escrow contract

```bash
cd contracts
npm install
npm run compile
npm run deploy
```

Copy the printed contract address into `BOUNTY_CONTRACT_ADDRESS` in both `agent/.env` and `backend/.env`.

## 6. Run it

```bash
npm install                     # from repo root, installs backend/frontend deps
npm run dev:backend             # terminal 1
npm run dev:frontend            # terminal 2

npm run agent:create-bounty     # posts a real funded bounty
npm run agent:start             # researcher identity: pays, analyzes, submits
npm run agent:start:intern      # intern identity: same flow, smaller budget buys a smaller sample
```

Or drive the whole thing from the dashboard at `http://localhost:5173` — the **Live Execution** screen runs the same flow with a live step-by-step view.

## 7. (Optional) Give each identity its own Hedera account, for the "Activate Bounty" race

Every bounty's Details page has an **Activate Bounty** button — it makes every configured identity (`researcher`, `intern`) attempt to claim that bounty at once, and whoever's `claimBounty` transaction lands first wins (the escrow contract only ever allows one claimant per bounty). Without this step, both identities sign with the same shared account from step 1, so the "race" is really one wallet against itself. To make it a real race between independent signers:

1. Create two more Hedera testnet accounts the same way as step 1 (portal.hedera.com, ECDSA key type, auto-funded by the portal).
2. Add them to `agent/.env`:
   ```
   RESEARCHER_HEDERA_ACCOUNT_ID=
   RESEARCHER_HEDERA_PRIVATE_KEY=
   INTERN_HEDERA_ACCOUNT_ID=
   INTERN_HEDERA_PRIVATE_KEY=
   ```
Any identity left unset falls back to the shared `AGENT_HEDERA_*` account, so this can be done incrementally.

## Troubleshooting

- **ISP blocking `app.ens.dev` / `manager.ens.dev`**: not needed — `setup-ens` never touches the ENS web app, it calls the contracts directly.
- **`eth_getLogs` range error from the Hedera relay**: already handled — bounty discovery windows to the last 200,000 blocks (empirically confirmed safely under Hashio's actual range cap) rather than querying from block 0.
- **Facilitator payment payload errors**: the Blocky402 facilitator expects `paymentPayload.accepted` to duplicate the payment requirements — already handled in `agent/lib/runAgent.js`, but worth knowing if you're extending this against the raw facilitator API yourself.
- **A write transaction reverts with `INSUFFICIENT_GAS`**: Hashio's gas estimation has been observed to under-shoot for calls that include a native HBAR transfer (`releaseReward`). Already handled — every contract write goes through `agent/lib/bountyEscrow.js`'s `writeAndConfirm`, which pins an explicit gas limit and checks the receipt status itself rather than trusting `waitForTransactionReceipt` not to silently return a reverted-but-mined transaction.
