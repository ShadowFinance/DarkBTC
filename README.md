# DarkBTC

DarkBTC is a Starknet-native privacy trading sandbox that combines a shielded note pool, a private AMM, a sealed-bid auction, and a dark orderbook in one codebase. The repository also includes a lightweight event indexer, Sepolia deployment tooling, seed scripts, and faucet-enabled mock tokens for running the full flow on testnet or local devnet.

The current branch is focused on Starknet Sepolia and developer ergonomics. It is not a production-ready privacy exchange yet, but it is a useful end-to-end prototype for private note handling, swap quoting, auction orchestration, dark order submission, and event-derived indexing.

## Status

- Network target: Starknet Sepolia and local Starknet devnet.
- Frontend routes: `/`, `/auction`, `/orderbook`, `/portfolio`, `/faucet`.
- Contracts and live addresses are tracked in `deployments/sepolia.json`.
- The recommended deployment path is `scripts/deploy.mjs`, `scripts/seed.mjs`, and `scripts/faucet.mjs`.
- Testnet only. Several core flows still stop short of full production settlement semantics.

## What DarkBTC Includes

| Module | What it does | Privacy boundary |
| --- | --- | --- |
| `NotePool` | Stores shielded note commitments in a Poseidon-based Merkle tree and tracks spent nullifiers. | Amounts are hidden behind commitments; membership is proven with Merkle paths. |
| `ShieldedSwap` | Executes private swaps against on-chain reserves using note spends and note re-minting. | Input and output notes are opaque on-chain; only commitments and asset addresses are emitted. |
| `SealedAuction` | Runs commit-reveal auctions over a configured deposit token. | Bid commitments remain hidden until reveal. |
| `DarkOrderbook` | Stores private order intent as commitments and emits fill hashes. | Order side, size, and price are hidden inside the commitment. |
| `MockERC20` | Mints faucet-friendly WBTC and USDC for demos and tests. | No privacy, strictly for local and Sepolia testing. |
| `indexer/server.mjs` | Serves Merkle proofs, auction state, order fills, and an RPC proxy. | Aggregates public chain data; it does not receive note or bid secrets. |

## Architecture

```text
Wallet
       |
       v
React frontend (Vite, StarknetKit, @starknet-react)
       |            \
       | secrets     \ fetch /api and /rpc
       | stay local   \
       v               v
Browser storage   Indexer + RPC proxy
                                                                       |
                                                                       v
                                                  Starknet Sepolia / Devnet
                                                                       |
              +----------------+----------------+
              |                |                |
              v                v                v
 NotePool       SealedAuction    DarkOrderbook
              |
              v
ShieldedSwap
```

### High-level flow

1. A wallet receives WBTC or USDC, typically through the faucet or a deployment seed script.
2. The frontend shields funds into `NotePool` by generating a local secret and a Poseidon commitment.
3. The user spends notes through `ShieldedSwap`, participates in `SealedAuction`, or posts commitments to `DarkOrderbook`.
4. The indexer derives public state from events and contract reads so the UI can render auctions, fills, and Merkle proofs.
5. Secrets remain local to the browser through Zustand persistence and are never sent to the indexer or RPC provider.

## Repository Layout

```text
abis/                  Synced contract ABIs used by scripts and the indexer
contracts/             Cairo contracts, utilities, and tests
deployments/           Committed network deployment manifests
frontend/              React/Vite application
indexer/               Lightweight Node HTTP indexer and RPC proxy
scripts/               Sepolia deployment, seeding, and faucet utilities
docker-compose.yml     Devnet + indexer + frontend local stack
```

## Protocol Model

### Note commitments

Frontend note commitments follow the helper in `frontend/src/lib/poseidon.ts`:

```text
note_commitment = Poseidon(
       secret,
       amount.low,
       amount.high,
       asset_id,
       nonce,
       domain("DARKBTC_NOTE")
)
```

The nullifier used to spend a note is:

```text
nullifier = Poseidon(secret, commitment, domain("DARKBTC_NULLIFIER"))
```

`NotePool` stores commitments in a Poseidon Merkle tree with `TREE_DEPTH = 20`, which gives a maximum depth of 20 sibling hashes per proof and a theoretical capacity of `2^20` leaves.

### Bid commitments

The auction commitment helper is:

```text
bid_commitment = Poseidon(
       amount.low,
       amount.high,
       secret,
       domain("DARKBTC_BID")
)
```

### Order commitments

The orderbook commitment helper is:

```text
order_commitment = Poseidon(
       side,
       amount.low,
       amount.high,
       price.low,
       price.high,
       secret,
       domain("DARKBTC_ORDER")
)
```

### Event visibility

DarkBTC tries to keep amounts, prices, and intent out of event payloads. In the current implementation:

- `NotePool` emits note commitments, nullifiers, recipient on withdrawal, and timestamps.
- `ShieldedSwap` emits input and output commitments plus assets and timestamps.
- `SealedAuction` emits auction IDs, bid commitments, state transitions, and winning metadata.
- `DarkOrderbook` emits opaque order IDs, fill proof hashes, and timestamps.

## Contracts

| Contract | Key entrypoints | Notes |
| --- | --- | --- |
| `contracts/src/note_pool.cairo` | `deposit`, `withdraw`, `transfer_note`, `get_merkle_root`, `get_tree_size`, `is_nullifier_spent`, `is_known_root`, `add_supported_asset` | Tracks supported assets, pool balances, nullifiers, commitments, and root history. |
| `contracts/src/shielded_swap.cairo` | `add_shielded_liquidity`, `remove_shielded_liquidity`, `swap`, `get_reserves`, `get_swap_quote` | Uses `NotePool` as the privacy boundary and charges a 30 bps fee. |
| `contracts/src/sealed_auction.cairo` | `create_auction`, `commit_bid`, `reveal_bid`, `advance_phase`, `settle_auction`, `cancel_auction`, `get_highest_bid` | Owner creates auctions, bidders commit with the configured deposit token, then reveal later. |
| `contracts/src/dark_orderbook.cairo` | `submit_order`, `fill_order`, `cancel_order`, `get_order_status`, `get_recent_fills` | Stores private order commitments and a rolling fill log. |
| `contracts/src/mock_erc20.cairo` | `mint` and the embedded ERC20 interface | Test token only. Public mint is intentional for demos and faucet use. |

## Frontend

The frontend lives in `frontend/` and uses:

- React 18
- TypeScript 5
- Vite 5
- `starknet` 8.9.0
- `starknetkit` 3.4.3
- `@starknet-react/core` 5.0.3
- `@starknet-react/chains` 5.0.3
- Zustand and React Query for local state and async caching

### Current pages

| Route | Purpose |
| --- | --- |
| `/` | Private swap flow with swap panel and shield deposit panel |
| `/auction` | Sealed-bid auctions and bid/reveal interactions |
| `/orderbook` | Recent fill activity and private order submission |
| `/portfolio` | Local note inventory, pending transactions, and balances |
| `/faucet` | Mint WBTC and USDC test tokens on Sepolia |

### Wallet connectors

`frontend/src/lib/wallet.ts` currently wires:

- Cartridge controller connector
- Argent X injected connector
- Braavos injected connector
- Ready web wallet connector

### Frontend data sources

- Direct contract calls for some quote and balance reads.
- Indexer-backed HTTP calls for auctions, order fills, and Merkle proofs.
- Browser-local secrets stored in Zustand persistence.

## Indexer and API

`indexer/server.mjs` is a lightweight Node HTTP service. It does three jobs:

1. Proxies `/rpc` traffic to Starknet upstreams.
2. Aggregates public chain state for auctions and order fills.
3. Reconstructs Merkle proofs from `NotePool` events.

### Available endpoints

| Endpoint | Description |
| --- | --- |
| `GET /health` | Health check, active upstream, and address-configuration status |
| `GET /api/auctions` | Auction list derived from contract reads and `AuctionCreated` events |
| `GET /api/orderbook/fills?limit=50` | Recent order fills with timestamps and tx hashes |
| `GET /api/proof/<commitment>` | Reconstructed Merkle proof for a note commitment |
| `POST /rpc` | JSON-RPC passthrough to Starknet upstreams |

### Important implementation detail

The indexer imports `starknet` from `frontend/node_modules/starknet/dist/index.mjs`. That means you should install frontend dependencies before running the indexer locally.

## Local Development

There is no root `package.json`, so commands are run from `contracts/`, `frontend/`, `indexer/`, or `scripts/`.

### Prerequisites

- Node.js 20+
- `pnpm`
- Scarb with support for the Cairo toolchain used by `contracts/Scarb.toml`
- Starknet Foundry compatible with `snforge_std = 0.44.0`

### Install dependencies

```bash
git clone https://github.com/ShadowFinance/DarkBTC.git
cd DarkBTC

cd frontend
corepack enable
pnpm install
cd ..
```

### Manual local run

```bash
cp .env.example .env

# Build Cairo contracts
cd contracts
scarb build
cd ..

# Start the indexer in one terminal
node indexer/server.mjs

# Start the frontend in another terminal
cd frontend
pnpm dev
```

With the default configuration:

- frontend runs on `http://localhost:5173`
- indexer runs on `http://localhost:3001`
- frontend proxies `/api` and `/rpc` through Vite to the indexer target

### Docker local stack

The repository ships `docker-compose.yml` for a three-service developer stack:

- `devnet`: Starknet devnet
- `indexer`: Node HTTP indexer with RPC upstream pointing at devnet
- `frontend`: Vite development server

Run it with:

```bash
docker compose up --build
```

By default the compose stack exposes:

- Starknet devnet on `http://localhost:5050`
- indexer on `http://localhost:3001`
- frontend on `http://localhost:5173`

## Sepolia Deployment Workflow

The preferred deployment workflow uses the ESM scripts in `scripts/`.

### 1. Prepare environment

Copy `.env.example` to `.env` and fill in at least:

- `DEPLOYER_PRIVATE_KEY`
- `DEPLOYER_ADDRESS`
- `RPC_URL`

If `WBTC_ADDRESS` and `USDC_ADDRESS` are left unset, `scripts/deploy.mjs` deploys faucet-enabled `MockERC20` contracts for both tokens.

### 2. Build contracts

```bash
cd contracts
scarb build
cd ..
```

### 3. Deploy protocol contracts

```bash
node scripts/deploy.mjs
```

This script:

- syncs ABIs from compiled artifacts into `abis/` and `frontend/src/abis/`
- declares `MockERC20`, `NotePool`, `ShieldedSwap`, `SealedAuction`, and `DarkOrderbook`
- optionally deploys mock WBTC and USDC
- registers supported assets in `NotePool`
- seeds initial shielded swap liquidity
- writes `deployments/sepolia.json`
- writes `frontend/.env.local`

### 4. Seed example market state

```bash
node scripts/seed.mjs
```

The seed script creates:

- an active auction
- a reveal-phase auction
- a settled auction
- five example dark orders, with fills for the first three

### 5. Fund a wallet from the deployer account

```bash
node scripts/faucet.mjs --recipient 0x... --wbtc 10 --usdc 100000
```

### Legacy scripts

The older `scripts/deploy.ts` and `scripts/seed.ts` remain in the repo, but the `.mjs` scripts are the current documented path.

## Current Sepolia Deployment

The checked-in deployment manifest currently points at the following Sepolia addresses:

| Item | Address |
| --- | --- |
| RPC | `https://api.cartridge.gg/x/starknet/sepolia` |
| NotePool | `0x5627a60f4511c403babe3092170d0208627cd4bc5a914fd6cd42aa705fb9a52` |
| ShieldedSwap | `0x0f212bfaeef11e9b6354fdb60c0d2b8598f71eb14605ee113ef9bc85d678cea` |
| SealedAuction | `0x05b5afb9515f30cec544001ff1be117560c5050d0178d7c21f578ccf7f2667ff` |
| DarkOrderbook | `0x04c6698f7279fad2e0722483e31333c38599d68f7db4e5de25a8013ce55ebe3a` |
| WBTC | `0x30da440e0911576918df9523e84a45ae2052589996612f97d2a5724444c3a51` |
| USDC | `0x5752cd65bc0d110b8b906883a7c6ec4c919cb5791907a6e978d12d38f15b5f6` |
| Auction deposit token | `0x5752cd65bc0d110b8b906883a7c6ec4c919cb5791907a6e978d12d38f15b5f6` |

The deployment manifest was recorded at Starknet block `8252303`.

## Environment Variables

`.env.example` documents the primary runtime variables.

| Variable | Used by | Description |
| --- | --- | --- |
| `DEPLOYER_PRIVATE_KEY` | scripts | Account private key used for deployment, seeding, and faucet actions |
| `DEPLOYER_ADDRESS` | scripts | Starknet account address matching the private key |
| `RPC_URL` | scripts, indexer | Primary Starknet RPC URL |
| `RPC_UPSTREAMS` | indexer, docker | Comma-separated RPC URLs for `/rpc` proxy failover |
| `VITE_NOTE_POOL_ADDRESS` | frontend, indexer | Deployed `NotePool` address |
| `VITE_SHIELDED_SWAP_ADDRESS` | frontend, indexer | Deployed `ShieldedSwap` address |
| `VITE_SEALED_AUCTION_ADDRESS` | frontend, indexer | Deployed `SealedAuction` address |
| `VITE_DARK_ORDERBOOK_ADDRESS` | frontend, indexer | Deployed `DarkOrderbook` address |
| `VITE_CHAIN_ID` | frontend | Current chain identifier, defaults to `SN_SEPOLIA` |
| `VITE_RPC_URL` | frontend | RPC URL used by the frontend, usually `/rpc` in dev |
| `VITE_WBTC_ADDRESS` | frontend | WBTC token contract |
| `VITE_WBTC_DECIMALS` | frontend | WBTC decimals, currently `18` in the checked-in deployment |
| `VITE_USDC_ADDRESS` | frontend | USDC token contract |
| `VITE_USDC_DECIMALS` | frontend | USDC decimals, currently `18` in the checked-in deployment |
| `VITE_AUCTION_DEPOSIT_TOKEN` | frontend | Token used to escrow auction deposits |
| `VITE_INDEXER_URL` | frontend | Indexer base path, usually `/api` in dev |
| `INDEXER_HOST` | indexer | Bind address for the Node HTTP server |
| `PORT` | indexer | Port for the Node HTTP server |
| `INDEXER_PROXY_TARGET` | frontend dev server | Backend target used by Vite proxy rules |

## Testing and Quality Checks

### Cairo tests

```bash
cd contracts
snforge test
```

### Frontend unit tests

```bash
cd frontend
pnpm test --run
```

### Frontend build

```bash
cd frontend
pnpm build
```

### Frontend lint

```bash
cd frontend
pnpm lint
```

## Troubleshooting

### The UI loads but actions are disabled

Check that the deployed contract and token addresses are set. Many hooks explicitly guard against `0x0` placeholders.

### `GET /api/proof/<commitment>` returns an error

The commitment may never have been emitted by `NotePool`, or the indexer may be pointing at the wrong RPC upstream or starting block.

### The indexer fails locally with a module import error

Install frontend dependencies first. The indexer reuses the `starknet` package from `frontend/node_modules`.

### The frontend cannot talk to Starknet locally

Make sure the Vite proxy target and indexer are both running, and that `VITE_RPC_URL` is set to `/rpc` for development.

### You accidentally generated `.starknet_accounts.json`

That file can contain private keys for local Starknet accounts. It should stay local and is now ignored by `.gitignore`.

## Security Notes

- Secrets for notes, bids, and private orders are generated client-side and stored in browser local storage.
- The indexer consumes only public chain data and environment configuration; it does not need note secrets.
- `frontend/.env.local` is generated by deployment scripts and should be treated as local runtime state.
- `deployments/sepolia.json` is intentionally committed because it describes a public testnet deployment.



## License

MIT © ShadowFinance 2024
