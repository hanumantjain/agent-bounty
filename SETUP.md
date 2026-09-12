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

## 3. Get an OpenAI API key

This is required, not optional — `judgeAnomaly()` (the actual SUSPICIOUS/CLEAR verdict logic,
called by both the agent when it claims a bounty and the verifier when it independently rechecks
one) is an LLM call with no fixed-rule fallback. Without a working key, agents can't submit
answers and the verifier can't check them.

1. Create an API key at [platform.openai.com](https://platform.openai.com/api-keys). This is
   billed separately from a ChatGPT subscription.
2. The default model (`gpt-4o-mini`, set in `OPENAI_MODEL`) is inexpensive and sufficient — no
   need to change it unless you want to.

## 4. Configure environment files

Copy each `.env.example` to `.env` and fill in the real values (all three files are git-ignored):

```bash
cp backend/.env.example backend/.env
cp agent/.env.example agent/.env
cp contracts/.env.example contracts/.env
```

**`backend/.env`**
- `HEDERA_PAY_TO_ACCOUNT_ID` — your second Hedera account (the one receiving payments)
- `GRAPH_API_KEY`, `GRAPH_SUBGRAPH_ID` — from step 2
- `OPENAI_API_KEY` — from step 3 (`OPENAI_MODEL` can stay at its default)
- Everything else can stay at its default

**`agent/.env`**
- `AGENT_HEDERA_ACCOUNT_ID`, `AGENT_HEDERA_PRIVATE_KEY` — your first Hedera account (the payer)
- `ENS_ADMIN_PRIVATE_KEY` — your Sepolia wallet's private key
- `ENS_PARENT_LABEL` — a unique label you want to register, e.g. `agentbounty-yourname` (no `.eth` suffix)
- `GRAPH_API_KEY`, `GRAPH_SUBGRAPH_ID` — same as backend, used by the independent verifier
- `OPENAI_API_KEY` — same as backend; this process needs its own copy, it does **not** inherit backend's (`judgeAnomaly()` is called directly from here, both when claiming a bounty and when verifying one)
- `BOUNTY_CONTRACT_ADDRESS` — leave blank until step 8
- `DATA_CREDIT_TOKEN_ID`, `HCS_AUDIT_TOPIC_ID` — leave blank until steps 6 and 7

**`contracts/.env`**
- `DEPLOYER_PRIVATE_KEY` — reuse your Hedera account's private key from `agent/.env`
- `VERIFIER_ADDRESS` — leave blank to default to the deployer's own address (fine for a single-operator demo; the contract already supports a distinct verifier account if you want to split the role later)
- `DATA_CREDIT_TOKEN_ID` — leave blank until step 6 (needed at deploy time — the contract's constructor takes the ADC token's address)

**Never** paste any private key into a chat/AI session — edit the `.env` files directly.

## 5. Register your ENS identities on Sepolia

This deploys your own ENSv2 subname registry, registers your parent name, creates three subnames (`researcher`, `intern`, `director`), gives each its own Permissioned Resolver, and sets the `agent.spending.limit` text record on each via a key-scoped Enhanced Access Control grant — all in one script, no faucet or UI needed beyond the Sepolia ETH you already have.

```bash
cd agent
npm install
npm run setup-ens
```

This takes a few minutes (there's a ~70 second commit-reveal wait built into ENS registration). It prints a transaction hash at every step — each one is checkable on Sepolia Etherscan.

## 6. Create the ADC data-credit token

A real HTS fungible token, "AgentBounty Data Credit" (`ADC`) — a second settlement asset agents
can pay for data with instead of HBAR, and (since this project's contract supports it) a second
asset a bounty's reward can be funded and paid out in too.

```bash
cd agent
node --env-file=.env scripts/setupDataCreditToken.js
```

This also distributes tiered starting balances to `researcher`/`intern`/`director` (deliberately
different amounts, so the HBAR-fallback behavior is actually exercised). Paste the printed token
ID into `DATA_CREDIT_TOKEN_ID` in **both** `agent/.env` and `contracts/.env`.

## 7. Set up the HCS payment audit topic

Every x402 settlement gets logged as a message to a dedicated Hedera Consensus Service topic — an
independently-checkable payment audit trail via the mirror node, not just an app-side log.

```bash
cd agent
node --env-file=.env scripts/setupHcsAuditTopic.js
```

Paste the printed topic ID into `HCS_AUDIT_TOPIC_ID` in `agent/.env`.

## 8. Deploy the bounty escrow contract

The contract can fund and pay out a bounty's reward in either HBAR or ADC, so it needs to know
the ADC token's address at deploy time — this is why `DATA_CREDIT_TOKEN_ID` must already be set
in `contracts/.env` (step 6) before running this.

```bash
cd contracts
npm install
npm run compile
npm run deploy
npm run associate-adc   # one-time: lets the contract hold ADC in escrow — must run before any
                         # ADC-funded bounty is created, or funding it will revert
```

Copy the printed contract address into `BOUNTY_CONTRACT_ADDRESS` in both `agent/.env` and `backend/.env`.

## 9. Run it

```bash
npm install                     # from repo root, installs backend/frontend deps
npm run dev:backend             # terminal 1
npm run dev:frontend            # terminal 2

npm run agent:create-bounty     # posts a real funded bounty
npm run agent:start             # researcher identity: pays, analyzes, submits
npm run agent:start:intern      # intern identity: same flow, smaller budget buys a smaller sample
```

Or drive the whole thing from the dashboard at `http://localhost:5173` — the **Live Execution** screen runs the same flow with a live step-by-step view.

## 10. (Optional) Give each identity its own Hedera account, for the "Activate Bounty" race

Every bounty's Details page has an **Activate Bounty** button — it makes every configured identity (`researcher`, `intern`, `director`) attempt to claim that bounty at once, and whoever's `claimBounty` transaction lands first wins (the escrow contract only ever allows one claimant per bounty). Without this step, all three identities sign with the same shared account from step 1, so the "race" is really one wallet against itself. To make it a real race between independent signers:

1. Create three more Hedera testnet accounts the same way as step 1 (portal.hedera.com, ECDSA key type, auto-funded by the portal).
2. Add them to `agent/.env`:
   ```
   RESEARCHER_HEDERA_ACCOUNT_ID=
   RESEARCHER_HEDERA_PRIVATE_KEY=
   INTERN_HEDERA_ACCOUNT_ID=
   INTERN_HEDERA_PRIVATE_KEY=
   DIRECTOR_HEDERA_ACCOUNT_ID=
   DIRECTOR_HEDERA_PRIVATE_KEY=
   ```
Any identity left unset falls back to the shared `AGENT_HEDERA_*` account, so this can be done incrementally. If you also want each identity's own real ADC balance rather than sharing the manager's, re-run step 6 after adding these accounts — `setupDataCreditToken.js` distributes balances to whichever of `researcher`/`intern`/`director` it finds dedicated accounts for.

## Troubleshooting

- **ISP blocking `app.ens.dev` / `manager.ens.dev`**: not needed — `setup-ens` never touches the ENS web app, it calls the contracts directly.
- **`eth_getLogs` range error from the Hedera relay**: already handled — bounty discovery windows to the last 200,000 blocks (empirically confirmed safely under Hashio's actual range cap) rather than querying from block 0.
- **Facilitator payment payload errors**: the Blocky402 facilitator expects `paymentPayload.accepted` to duplicate the payment requirements — already handled in `agent/lib/runAgent.js`, but worth knowing if you're extending this against the raw facilitator API yourself.
- **A write transaction reverts with `INSUFFICIENT_GAS`**: Hashio's gas estimation has been observed to under-shoot for calls that include a native HBAR transfer (`releaseReward`). Already handled — every contract write goes through `agent/lib/bountyEscrow.js`'s `writeAndConfirm`, which pins an explicit gas limit and checks the receipt status itself rather than trusting `waitForTransactionReceipt` not to silently return a reverted-but-mined transaction.
