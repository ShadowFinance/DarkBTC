import crypto from 'node:crypto';
import { poseidonHashMany } from '../frontend/node_modules/micro-starknet/lib/esm/index.js';
import {
  Account,
  Contract,
  RpcProvider,
  cairo,
  hash,
} from '../frontend/node_modules/starknet/dist/index.mjs';
import {
  asciiDomain,
  loadArtifact,
  loadDeployments,
  loadEnv,
  normalizeHex,
  requireEnv,
} from './lib/common.mjs';

const NETWORK = 'sepolia';
const MASK128 = (1n << 128n) - 1n;
const TREE_DEPTH = 20;
const ZERO_VALUE = asciiToHex('DARKBTC_EMPTY_LEAF');

async function main() {
  const env = loadEnv();
  const deployments = loadDeployments(NETWORK);
  const rpcUrl = deployments.rpcUrl ?? env.RPC_URL ?? 'https://api.cartridge.gg/x/starknet/sepolia';
  const privateKey = requireEnv(env, 'DEPLOYER_PRIVATE_KEY');
  const address = requireEnv(env, 'DEPLOYER_ADDRESS');

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const account = new Account({
    provider,
    address,
    signer: privateKey,
  });

  const notePool = new Contract({
    abi: loadArtifact('NotePool', '.contract_class.json').abi,
    address: deployments.contracts.NotePool.address,
    providerOrAccount: account,
  });
  const shieldedSwap = new Contract({
    abi: loadArtifact('ShieldedSwap', '.contract_class.json').abi,
    address: deployments.contracts.ShieldedSwap.address,
    providerOrAccount: account,
  });
  const sealedAuction = new Contract({
    abi: loadArtifact('SealedAuction', '.contract_class.json').abi,
    address: deployments.contracts.SealedAuction.address,
    providerOrAccount: account,
  });
  const darkOrderbook = new Contract({
    abi: loadArtifact('DarkOrderbook', '.contract_class.json').abi,
    address: deployments.contracts.DarkOrderbook.address,
    providerOrAccount: account,
  });
  const tokenAbi = loadArtifact('MockERC20', '.contract_class.json').abi;
  const wbtc = new Contract({
    abi: tokenAbi,
    address: deployments.tokens.WBTC.address,
    providerOrAccount: account,
  });
  const usdc = new Contract({
    abi: tokenAbi,
    address: deployments.tokens.USDC.address,
    providerOrAccount: account,
  });

  const depositAmount = 1n * 10n ** 18n;
  const requiredUsdc = 37_500n * 10n ** 18n;
  const wbtcBalance = parseU256(await wbtc.call('balanceOf', [address]));
  const usdcBalance = parseU256(await usdc.call('balanceOf', [address]));
  if (wbtcBalance < depositAmount) {
    throw new Error(`Deployer wallet needs at least ${depositAmount} WBTC units for smoke test`);
  }
  if (usdcBalance < requiredUsdc) {
    throw new Error(`Deployer wallet needs at least ${requiredUsdc} USDC units for smoke test`);
  }

  const depositSecret = randomFelt();
  const depositNonce = BigInt(Date.now());
  const depositCommitment = hashNoteCommitment(
    depositSecret,
    depositAmount,
    BigInt(deployments.tokens.WBTC.address),
    depositNonce,
  );
  const depositNullifier = hashNullifier(depositSecret, depositCommitment);

  await waitFor(
    provider,
    await wbtc.approve(deployments.contracts.NotePool.address, cairo.uint256(depositAmount)),
    'Approve WBTC for note pool',
  );
  await waitFor(
    provider,
    await notePool.deposit(
      deployments.tokens.WBTC.address,
      cairo.uint256(depositAmount),
      normalizeHex(depositCommitment),
      0,
    ),
    'Deposit exact WBTC note',
  );

  const proof = await buildProof({
    provider,
    notePoolAddress: deployments.contracts.NotePool.address,
    startBlock: deployments.blockNumber,
    commitment: normalizeHex(depositCommitment),
  });

  const quote = await shieldedSwap.call('get_swap_quote', [
    deployments.tokens.WBTC.address,
    deployments.tokens.USDC.address,
    cairo.uint256(depositAmount),
  ]);
  const outputAmount = parseU256(quote.output_amount ?? quote[1] ?? quote);
  if (outputAmount <= 0n) {
    throw new Error('Smoke quote returned zero output amount');
  }

  const outputSecret = randomFelt();
  const outputNonce = BigInt(Date.now() + 1);
  const outputCommitment = hashNoteCommitment(
    outputSecret,
    outputAmount,
    BigInt(deployments.tokens.USDC.address),
    outputNonce,
  );

  await waitFor(
    provider,
    await shieldedSwap.swap(
      normalizeHex(depositNullifier),
      normalizeHex(depositCommitment),
      proof.root,
      proof.proof,
      proof.indices,
      deployments.tokens.WBTC.address,
      deployments.tokens.USDC.address,
      cairo.uint256(depositAmount),
      cairo.uint256((outputAmount * 99n) / 100n),
      normalizeHex(outputCommitment),
      0,
      BigInt(Math.floor(Date.now() / 1000) + 600),
    ),
    'Swap WBTC note to USDC note',
  );

  const orderAmount = 1n * 10n ** 18n;
  const orderPrice = 50_000n * 10n ** 18n;
  const collateralAmount = 10_000n * 10n ** 18n;
  const orderCommitment = hashOrderCommitment(0n, orderAmount, orderPrice, randomFelt());

  await waitFor(
    provider,
    await usdc.approve(deployments.contracts.DarkOrderbook.address, cairo.uint256(collateralAmount)),
    'Approve USDC for dark orderbook',
  );
  await waitFor(
    provider,
    await darkOrderbook.submit_order(
      normalizeHex(orderCommitment),
      deployments.tokens.WBTC.address,
      cairo.uint256(collateralAmount),
      deployments.tokens.USDC.address,
    ),
    'Submit dark order',
  );

  const auctionId = await ensureActiveAuction({
    provider,
    sealedAuction,
    assetId: deployments.tokens.WBTC.address,
    reservePrice: 25_000n * 10n ** 18n,
  });
  const auctionReserve = parseU256(await sealedAuction.call('get_auction_reserve_price', [auctionId]));
  const bidAmount = auctionReserve + 2_500n * 10n ** 18n;
  const bidSecret = randomFelt();
  const bidCommitment = hashBidCommitment(bidAmount, bidSecret);

  await waitFor(
    provider,
    await usdc.approve(deployments.contracts.SealedAuction.address, cairo.uint256(auctionReserve)),
    'Approve USDC for auction reserve',
  );
  await waitFor(
    provider,
    await sealedAuction.commit_bid(auctionId, normalizeHex(bidCommitment)),
    `Commit sealed bid on auction ${auctionId}`,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        smoke: {
          balances: {
            WBTC: wbtcBalance.toString(),
            USDC: usdcBalance.toString(),
          },
          deposit: normalizeHex(depositCommitment),
          swapOutputCommitment: normalizeHex(outputCommitment),
          orderCommitment: normalizeHex(orderCommitment),
          auctionId: auctionId.toString(),
          bidCommitment: normalizeHex(bidCommitment),
        },
      },
      null,
      2,
    ),
  );
}

async function ensureActiveAuction({ provider, sealedAuction, assetId, reservePrice }) {
  const count = Number(await sealedAuction.call('get_auction_count'));
  const now = Math.floor(Date.now() / 1000);

  for (let index = count - 1; index >= 0; index -= 1) {
    const auction = await sealedAuction.call('get_auction', [BigInt(index)]);
    const state = parseEnum(auction[0]);
    const commitEnd = Number(auction[1]);
    if (state === 'CommitPhase' && commitEnd > now) {
      return BigInt(index);
    }
  }

  const tx = await sealedAuction.create_auction(
    assetId,
    cairo.uint256(reservePrice),
    172_800,
    172_800,
  );
  await waitFor(provider, tx, 'Create fresh active auction');

  const nextCount = BigInt(await sealedAuction.call('get_auction_count'));
  return nextCount - 1n;
}

async function buildProof({ provider, notePoolAddress, startBlock, commitment }) {
  const noteDeposited = hash.getSelectorFromName('NoteDeposited').toLowerCase();
  const noteTransferred = hash.getSelectorFromName('NoteTransferred').toLowerCase();
  const events = await getAllEvents(provider, {
    address: notePoolAddress,
    from_block: { block_number: startBlock },
    to_block: 'latest',
    keys: [[noteDeposited, noteTransferred]],
  });

  const leaves = [];
  for (const event of events) {
    const selector = normalizeHex(event.keys[0]).toLowerCase();
    if (selector === noteDeposited) {
      leaves.push(normalizeHex(event.data[0]));
    }
    if (selector === noteTransferred) {
      leaves.push(normalizeHex(event.data[1]));
    }
  }

  const leafIndex = leaves.findIndex((leaf) => leaf === normalizeHex(commitment));
  if (leafIndex === -1) {
    throw new Error(`Unable to find commitment ${commitment} in the note tree`);
  }

  const proof = [];
  let currentIndex = leafIndex;
  let levelNodes = [...leaves];

  for (let level = 0; level < TREE_DEPTH; level += 1) {
    const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
    proof.push(levelNodes[siblingIndex] ?? ZERO_VALUE);

    const nextLevel = [];
    for (let index = 0; index < Math.max(levelNodes.length, 1); index += 2) {
      const left = levelNodes[index] ?? ZERO_VALUE;
      const right = levelNodes[index + 1] ?? ZERO_VALUE;
      nextLevel.push(normalizeHex(poseidonHashMany([BigInt(left), BigInt(right)])));
    }

    levelNodes = nextLevel;
    currentIndex = Math.floor(currentIndex / 2);
  }

  return {
    proof,
    indices: leafIndex,
    root: levelNodes[0] ?? ZERO_VALUE,
  };
}

async function getAllEvents(provider, filter) {
  const events = [];
  let continuationToken;

  do {
    const page = await provider.getEvents({
      ...filter,
      chunk_size: 100,
      continuation_token: continuationToken,
    });
    events.push(...page.events);
    continuationToken = page.continuation_token;
  } while (continuationToken);

  return events;
}

function hashNoteCommitment(secret, amount, assetId, nonce) {
  return hash.computePoseidonHashOnElements([
    secret,
    amount & MASK128,
    amount >> 128n,
    assetId,
    nonce,
    asciiDomain('DARKBTC_NOTE'),
  ]);
}

function hashNullifier(secret, commitment) {
  return hash.computePoseidonHashOnElements([
    secret,
    commitment,
    asciiDomain('DARKBTC_NULLIFIER'),
  ]);
}

function hashBidCommitment(amount, secret) {
  return hash.computePoseidonHashOnElements([
    amount & MASK128,
    amount >> 128n,
    secret,
    asciiDomain('DARKBTC_BID'),
  ]);
}

function hashOrderCommitment(side, amount, price, secret) {
  return hash.computePoseidonHashOnElements([
    side,
    amount & MASK128,
    amount >> 128n,
    price & MASK128,
    price >> 128n,
    secret,
    asciiDomain('DARKBTC_ORDER'),
  ]);
}

function parseU256(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') return BigInt(value);
  return BigInt(value.low) + (BigInt(value.high) << 128n);
}

function parseEnum(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value) {
    if (typeof value.variant === 'string') return value.variant;
    const enumKey = Object.keys(value).find((key) => !['variant', 'activeVariant', 'value'].includes(key));
    if (enumKey) return enumKey;
  }
  return `${value}`;
}

function asciiToHex(value) {
  return `0x${Buffer.from(value, 'ascii').toString('hex')}`;
}

function randomFelt() {
  return BigInt(`0x${crypto.randomBytes(31).toString('hex')}`);
}

async function waitFor(provider, tx, label) {
  const txHash = tx.transaction_hash;
  if (!txHash) {
    throw new Error(`Missing transaction hash for ${label}`);
  }

  console.log(`${label}: ${txHash}`);
  await provider.waitForTransaction(txHash);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
