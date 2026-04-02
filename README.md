# DarkBTC

DarkBTC is a Starknet-native privacy execution layer for Bitcoin-denominated trading flows. It combines shielded note deposits, private BTC swaps, sealed-bid auctions, and a dark order entry flow into one end-to-end application built for the PL Genesis: Frontier of Collaboration Hackathon 2026 Starknet track.

Live app: https://dark-btc.vercel.app  
Indexer API: https://darkbtc-indexer.onrender.com

## Why DarkBTC Fits The Starknet Track

The Starknet track asks for privacy-preserving Bitcoin applications that use Starknet or zero-knowledge infrastructure in a meaningful way. DarkBTC is built around that exact premise:

- Private swap flow: users convert BTC exposure without publishing order intent or trade amounts in the UI flow.
- Shielded note pool: assets are moved into opaque commitments before execution.
- Sealed-bid auctions: bids remain hidden during the commit phase and are only revealed later by the bidder.
- Dark order entry: order side, amount, and price are committed off-chain first and only opaque commitments are posted on-chain.
- Starknet-native implementation: the system is written in Cairo, deployed on Starknet Sepolia, and surfaced through a production web application plus indexer.

## Submission Alignment

### Privacy Innovation

DarkBTC hides market intent in multiple ways:

- Shielded notes hide deposited trading inventory behind Poseidon commitments.
- Swaps spend notes rather than public balances in the user experience.
- Auction bids use commit-reveal instead of transparent live bidding.
- Dark order entry commits private order details before any fill proof is published.

### Technical Execution

This repository ships a complete working stack:

- Cairo contracts for the note pool, swap engine, sealed auction, and dark orderbook.
- A React/Vite frontend with wallet integration and production-safe transaction handling.
- A Node indexer and RPC proxy used by the frontend for proofs, fills, auctions, and faucet execution.
- Sepolia deployment tooling, seed tooling, and a reproducible smoke-test script.

### Integration With Starknet

DarkBTC uses Starknet directly rather than treating it as a generic hosting layer:

- Contracts are written in Cairo.
- Commitments and Merkle paths are Poseidon-based.
- The app integrates with Starknet wallets through `starknetkit` and `@starknet-react`.
- All protocol state is deployed to Starknet Sepolia and queried live.

### Usability And Design

The frontend is designed around live execution rather than mock flows:

- Wallet balances are surfaced where users need them.
- Swap execution only enables exact-size shielded notes, matching current contract behavior safely.
- Expired auctions can be advanced from the UI.
- The faucet now uses a real treasury-backed backend route instead of assuming a nonexistent token mint entrypoint.

### Potential Impact

DarkBTC is aimed at a real problem: privacy for BTC-denominated market activity. If extended from Sepolia to production infrastructure, the same architecture can support:

- Private BTC swaps
- Private OTC and block-style execution
- Sealed liquidation or collateral auctions
- Shielded trading intents for institutions, treasury desks, and privacy-sensitive individuals

## What Works Right Now

The current deployment has been verified against Starknet Sepolia:

- Faucet liquidity requests through the indexer-backed faucet route
- Shield deposits into `NotePool`
- Shielded WBTC to USDC swap execution
- Dark order submission
- Sealed bid commitment
- Auction discovery and phase advancement
- Order fill indexing
- Merkle proof generation for deposited notes

In addition, `scripts/smoke.mjs` successfully exercised the live contracts and created a fresh active auction on Sepolia during verification.

## Production Architecture

```text
User Wallet
    |
    v
DarkBTC Frontend (Vercel)
    |
    +--> /rpc  ----------+
    |                    |
    +--> /api ---------->|  DarkBTC Indexer (Render)
                         |    - proof generation
                         |    - auction/fill indexing
                         |    - treasury-backed faucet
                         |    - Starknet RPC proxy
                         v
                    Starknet Sepolia
                         |
     +-------------------+--------------------+
     |                   |                    |
     v                   v                    v
  NotePool         ShieldedSwap        SealedAuction
                         |
                         v
                   DarkOrderbook
```

## Core Modules

| Module | Purpose |
| --- | --- |
| `contracts/src/note_pool.cairo` | Stores shielded commitments, roots, nullifiers, and supported assets |
| `contracts/src/shielded_swap.cairo` | Private swap engine over shielded inventory |
| `contracts/src/sealed_auction.cairo` | Commit-reveal auction system for BTC-denominated markets |
| `contracts/src/dark_orderbook.cairo` | Private order submission and fill logging |
| `frontend/` | Wallet-connected trading application |
| `indexer/` | Proof service, RPC proxy, auction/fill API, and faucet backend |
| `scripts/` | Deployment, seeding, faucet funding, and Sepolia smoke verification |

## Live Contracts

### Protocol

- `NotePool`: `0x5627a60f4511c403babe3092170d0208627cd4bc5a914fd6cd42aa705fb9a52`
- `ShieldedSwap`: `0xf212bfaeef11e9b6354fdb60c0d2b8598f71eb14605ee113ef9bc85d678cea`
- `SealedAuction`: `0x5b5afb9515f30cec544001ff1be117560c5050d0178d7c21f578ccf7f2667ff`
- `DarkOrderbook`: `0x4c6698f7279fad2e0722483e31333c38599d68f7db4e5de25a8013ce55ebe3a`

### Assets

- `WBTC`: `0x30da440e0911576918df9523e84a45ae2052589996612f97d2a5724444c3a51`
- `USDC`: `0x5752cd65bc0d110b8b906883a7c6ec4c919cb5791907a6e978d12d38f15b5f6`

## Frontend Routes

- `/` - private swap plus shield deposit
- `/auction` - sealed-bid auction discovery, bid commit, reveal, and phase advancement
- `/orderbook` - private order entry plus indexed recent fills
- `/portfolio` - local shielded notes, private orders, and privacy score view
- `/faucet` - treasury-backed Starknet Sepolia liquidity access

## Important Protocol Behavior

DarkBTC currently enforces a single-note swap model in the frontend for safety:

- users shield exact trade sizes into notes
- swaps spend one note at a time
- the UI only enables swaps when an exact-size input note exists

This matches the current contract execution model and avoids unsafe balance drift in the client.

## Local Development

### Requirements

- Node.js 20+
- npm
- Scarb

### Install

```bash
git clone https://github.com/ShadowFinance/DarkBTC.git
cd DarkBTC

cd frontend && npm install && cd ..
cd indexer && npm install && cd ..
cd contracts && scarb build && cd ..
```

### Environment

Copy the example file and fill in local values where needed:

```bash
cp .env.example .env
```

Key variables:

- `DEPLOYER_PRIVATE_KEY`
- `DEPLOYER_ADDRESS`
- `RPC_URL`
- `RPC_UPSTREAMS`
- `VITE_NOTE_POOL_ADDRESS`
- `VITE_SHIELDED_SWAP_ADDRESS`
- `VITE_SEALED_AUCTION_ADDRESS`
- `VITE_DARK_ORDERBOOK_ADDRESS`
- `VITE_WBTC_ADDRESS`
- `VITE_USDC_ADDRESS`
- `VITE_AUCTION_DEPOSIT_TOKEN`

### Run Locally

Terminal 1:

```bash
cd indexer
npm start
```

Terminal 2:

```bash
cd frontend
npm run dev
```

## Verification

### Frontend

```bash
cd frontend
npm run lint
npm run build
```

### Contracts

```bash
cd contracts
scarb build
```

### Live Sepolia Smoke

This script verifies the deployed stack by:

- checking treasury balances on the deployer account
- depositing a shielded WBTC note
- executing a shielded swap
- submitting a dark order
- creating a fresh active auction if needed
- committing a sealed bid

```bash
node scripts/smoke.mjs
```

## Deployment

### Render Indexer

The repo includes [`render.yaml`](/render.yaml) for the indexer service.

Expected service:

- service name: `darkbtc-indexer`
- health check: `/health`
- runtime: Node
- frontend-facing base URL: `https://darkbtc-indexer.onrender.com`

### Vercel Frontend

Deploy from the [`frontend`](/DarkBTC/frontend) directory. [`frontend/vercel.json`](/DarkBTC/frontend/vercel.json) rewrites:

- `/api/*` to the Render indexer
- `/rpc/*` to the Render indexer
- SPA routes back to `index.html`

```bash
cd frontend
vercel link --yes --project dark-btc --scope kiwi-protocols-projects
vercel --prod
```

## Repository Layout

```text
abis/             Contract ABIs used by scripts and the indexer
contracts/        Cairo contracts and tests
deployments/      Network manifests
frontend/         Vite + React trading interface
indexer/          Render-deployed API and RPC proxy
render.yaml       Render blueprint for the indexer
scripts/          Deploy, seed, faucet, and smoke verification scripts
```

## Team

Add the submitting team members here before final hackathon submission.

## License

MIT
