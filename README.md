# DarkBTC

A ZK-powered dark pool for Bitcoin on Starknet. Three privacy primitives share one underlying architecture: you commit to a trade intent with a Poseidon-hashed ZK commitment, execute without leaking counterparty, amount, or price on-chain.

---

## Architecture

```
Bitcoin L1 (sBTC / WBTC)
         │
         ▼
   Starknet L2
 ┌────────────────────────────────────┐
 │        NotePool.cairo              │
 │  Poseidon Merkle tree (depth 20)   │
 │  Nullifier set · Note commitments  │
 └──────┬──────────────┬─────────────┘
        │              │             │
        ▼              ▼             ▼
 ShieldedSwap    SealedAuction  DarkOrderbook
 Private AMM     Commit-Reveal  Private CLOB
        │              │             │
        └──────────────┴─────────────┘
                       │
                       ▼
           React Frontend (StarknetKit)
           Secrets stored client-side only
```

---

## Privacy Model

**Notes / UTXO Commitments**  
Assets enter the protocol as shielded UTXOs. Each note is represented by a Poseidon hash commitment:

```
commitment = Poseidon(secret, amount.low, amount.high, asset_id, nonce, 'DARKBTC_NOTE')
```

Notes are inserted into a sparse Merkle tree (depth 20, ~1M leaves). Membership is proven by supplying a Merkle path.

**Nullifiers**  
To spend a note, you reveal its nullifier:

```
nullifier = Poseidon(secret, commitment, 'DARKBTC_NULLIFIER')
```

The nullifier set prevents double-spends without revealing which note was spent.

**Merkle Root History**  
The contract stores every historical root so proofs generated before a new deposit remain valid.

**Event Privacy Invariant**  
No on-chain event ever contains a wallet address (except `NoteWithdrawn.recipient`), trade amount, bid amount, price, or order side. Only opaque commitment hashes and timestamps.

---

## Features

- **Private AMM Swap** — constant-product AMM (x·y=k), 30 bps fee, shielded BTC ↔ stablecoin
- **Sealed-Bid Auction** — commit → reveal two-phase auction with ZK bid hashes; losing bids stay hidden
- **Dark Orderbook** — private CLOB; order intent is never revealed until fill

---

## Tech Stack

| Layer | Tools |
|---|---|
| Contracts | Cairo 2.6, Scarb 2.6, Starknet Foundry (snforge 0.24), OpenZeppelin Cairo v0.14 |
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS v3, starknet.js v6, StarknetKit v2, @starknet-react/core v3 |
| State | Zustand v4 (persisted), @tanstack/react-query v5 |
| ZK Hashing | Poseidon via `micro-starknet` (matches Cairo `PoseidonTrait`) |
| Testing | snforge (Cairo), Vitest (frontend) |

---

## Prerequisites

- Node 20, pnpm 9
- [Scarb 2.6](https://docs.swmansion.com/scarb/)
- [starknet-foundry 0.24](https://foundry-rs.github.io/starknet-foundry/)

---

## Install & Develop

```bash
# Clone
git clone https://github.com/ShadowFinance/DarkBTC
cd DarkBTC

# Build contracts
cd contracts && scarb build

# Run contract tests
cd contracts && snforge test

# Install frontend
cd frontend && pnpm install

# Start dev server
cd frontend && pnpm dev
```

---

## Testing

```bash
# Cairo unit tests
cd contracts && snforge test

# Frontend unit tests
cd frontend && pnpm test --run
```

---

## Deploy

```bash
cp .env.example .env
# Fill in DEPLOYER_PRIVATE_KEY, DEPLOYER_ADDRESS, RPC_URL, WBTC_ADDRESS, USDC_ADDRESS

cd contracts && scarb build
npx ts-node scripts/deploy.ts
```

Writes `deployments/sepolia.json` and `frontend/.env.local`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `DEPLOYER_PRIVATE_KEY` | Starknet deployer private key |
| `DEPLOYER_ADDRESS` | Deployer contract address |
| `RPC_URL` | Starknet RPC endpoint |
| `VITE_NOTE_POOL_ADDRESS` | Deployed NotePool address |
| `VITE_SHIELDED_SWAP_ADDRESS` | Deployed ShieldedSwap address |
| `VITE_SEALED_AUCTION_ADDRESS` | Deployed SealedAuction address |
| `VITE_DARK_ORDERBOOK_ADDRESS` | Deployed DarkOrderbook address |
| `VITE_CHAIN_ID` | `SN_SEPOLIA` or `SN_MAIN` |
| `VITE_RPC_URL` | Frontend RPC endpoint |
| `VITE_WBTC_ADDRESS` | WBTC token contract address |
| `VITE_USDC_ADDRESS` | USDC token contract address |
| `VITE_INDEXER_URL` | Merkle proof indexer base URL |

---

## Hash Test Vector

```ts
// TypeScript (frontend/src/lib/poseidon.ts)
hashNoteCommitment(1n, 100_000_000n, 0x1234n, 0n)
// Must equal the Cairo output of:
// hash_note_commitment(1, 100000000_u256, 0x1234, 0_u64)
// Both use Poseidon([1, 100000000, 0, 0x1234, 0, domain('DARKBTC_NOTE')])
```

---

## Security Considerations

- **Secrets never leave the client.** Note secrets, bid secrets, and order secrets are stored only in browser localStorage via Zustand persist. They are never sent to any backend or RPC node.
- **Merkle proof verification is on-chain.** All note spends are verified against the on-chain Merkle root history.
- **Nullifier set prevents double-spend.** Nullifiers are stored in a contract map and checked before any withdrawal.
- **ZK proof of fill is off-chain in v0.1.** `fill_order` in `DarkOrderbook` accepts a `fill_proof` field but full STARK proof verification is not yet performed on-chain. This is a known limitation.

---

## Known Limitations

1. **No recursive STARK proof.** Individual note privacy relies on Poseidon commitment + nullifier, not a full ZK circuit. Recursive proof verification is planned for v0.2.
2. **Fill matching is off-chain.** Order matching and `fill_proof` generation happen off-chain. The on-chain contract only records filled state.
3. **Indexer required for withdrawals.** A Merkle proof indexer (`VITE_INDEXER_URL`) must be running to generate withdrawal proofs. The `docker-compose.yml` includes a placeholder.
4. **No LP token.** `ShieldedSwap` tracks reserves but does not yet mint ERC-20 LP tokens.

---

## License

MIT © ShadowFinance 2024
