import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { poseidonHashMany } from 'micro-starknet';
import { Account, Contract, RpcProvider, hash } from 'starknet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ZERO_VALUE = asciiToHex('DARKBTC_EMPTY_LEAF');
const CACHE_TTL_MS = 15_000;
const DEFAULT_FAUCET_LIMITS = {
  WBTC: 10n * 10n ** 18n,
  USDC: 100_000n * 10n ** 18n,
};

const deploymentPath = path.join(ROOT_DIR, 'deployments', 'sepolia.json');
const deploymentInfo = existsSync(deploymentPath)
  ? JSON.parse(readFileSync(deploymentPath, 'utf8'))
  : null;

const runtimeEnv = {
  ...readEnvFile(path.join(ROOT_DIR, '.env')),
  ...readEnvFile(path.join(ROOT_DIR, 'frontend', '.env.local')),
  ...process.env,
};

const config = {
  host: runtimeEnv.INDEXER_HOST ?? '0.0.0.0',
  port: Number(runtimeEnv.PORT ?? '3001'),
  upstreams: (runtimeEnv.RPC_UPSTREAMS ?? runtimeEnv.RPC_URL ?? 'https://api.cartridge.gg/x/starknet/sepolia')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  notePool: runtimeEnv.VITE_NOTE_POOL_ADDRESS ?? deploymentInfo?.contracts?.NotePool?.address ?? '0x0',
  shieldedSwap: runtimeEnv.VITE_SHIELDED_SWAP_ADDRESS ?? deploymentInfo?.contracts?.ShieldedSwap?.address ?? '0x0',
  sealedAuction: runtimeEnv.VITE_SEALED_AUCTION_ADDRESS ?? deploymentInfo?.contracts?.SealedAuction?.address ?? '0x0',
  darkOrderbook: runtimeEnv.VITE_DARK_ORDERBOOK_ADDRESS ?? deploymentInfo?.contracts?.DarkOrderbook?.address ?? '0x0',
  wbtc: runtimeEnv.VITE_WBTC_ADDRESS ?? deploymentInfo?.tokens?.WBTC?.address ?? '0x0',
  usdc: runtimeEnv.VITE_USDC_ADDRESS ?? deploymentInfo?.tokens?.USDC?.address ?? '0x0',
  deployerAddress: runtimeEnv.DEPLOYER_ADDRESS ?? '0x0',
  deployerPrivateKey: runtimeEnv.DEPLOYER_PRIVATE_KEY ?? '',
  faucetCooldownMs: Number(runtimeEnv.FAUCET_COOLDOWN_MS ?? '120000'),
  startBlock: deploymentInfo?.blockNumber ?? 0,
};

const caches = {
  auctions: createCacheEntry(),
  fills: new Map(),
  proofs: new Map(),
  faucetClaims: new Map(),
};

const abis = {
  notePool: loadJson(path.join(ROOT_DIR, 'abis', 'note_pool.json')),
  sealedAuction: loadJson(path.join(ROOT_DIR, 'abis', 'sealed_auction.json')),
};

const selectors = {
  noteDeposited: hash.getSelectorFromName('NoteDeposited').toLowerCase(),
  noteTransferred: hash.getSelectorFromName('NoteTransferred').toLowerCase(),
  auctionCreated: hash.getSelectorFromName('AuctionCreated').toLowerCase(),
  orderFilled: hash.getSelectorFromName('OrderFilled').toLowerCase(),
};

let activeUpstreamIndex = 0;

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    setCorsHeaders(response);

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) {
      sendJson(response, 200, {
        ok: true,
        upstream: config.upstreams[activeUpstreamIndex] ?? null,
        startBlock: config.startBlock,
        configured: {
          notePool: isConfiguredAddress(config.notePool),
          sealedAuction: isConfiguredAddress(config.sealedAuction),
          darkOrderbook: isConfiguredAddress(config.darkOrderbook),
          faucet: isConfiguredAddress(config.deployerAddress) && !!config.deployerPrivateKey,
        },
      });
      return;
    }

    if (url.pathname === '/rpc' || url.pathname.startsWith('/rpc/')) {
      const body = await readRawBody(request);
      const proxied = await proxyRpc({
        method: request.method ?? 'POST',
        pathname: url.pathname.replace(/^\/rpc/, ''),
        search: url.search,
        body,
        headers: request.headers,
      });
      response.writeHead(proxied.status, proxied.headers);
      response.end(proxied.body);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/auctions') {
      sendJson(response, 200, await getAuctions());
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/orderbook/fills') {
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '50')));
      sendJson(response, 200, await getOrderFills(limit));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/faucet') {
      const body = JSON.parse((await readRawBody(request)).toString('utf8') || '{}');
      sendJson(response, 200, await claimFaucet(body));
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/proof/')) {
      const commitment = url.pathname.replace('/api/proof/', '');
      sendJson(response, 200, await getProof(commitment));
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(response, 500, { error: message });
  }
}).listen(config.port, config.host, () => {
  console.log(`DarkBTC indexer listening on http://${config.host}:${config.port}`);
});

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const contents = readFileSync(filePath, 'utf8');
  return Object.fromEntries(
    contents
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
        return [key, value];
      }),
  );
}

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function asciiToHex(value) {
  const hex = Buffer.from(value, 'ascii').toString('hex');
  return `0x${hex}`;
}

function normalizeHex(value) {
  if (typeof value === 'bigint') return `0x${value.toString(16)}`;
  if (typeof value === 'number') return `0x${value.toString(16)}`;
  if (typeof value !== 'string') return '0x0';
  return value.startsWith('0x') ? value.toLowerCase() : `0x${value.toLowerCase()}`;
}

function isConfiguredAddress(value) {
  return typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value) && value !== '0x0';
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
    if (typeof value.variant === 'object' && value.variant) {
      const activeVariant = Object.entries(value.variant).find(([, variantValue]) => variantValue !== undefined)?.[0];
      if (activeVariant) return activeVariant;
    }
    if (typeof value.activeVariant === 'string') return value.activeVariant;
    if (typeof value.value === 'string') return value.value;

    const enumKey = Object.keys(value).find(
      (key) => !['variant', 'activeVariant', 'value'].includes(key),
    );
    if (enumKey) return enumKey;
  }
  return `${value}`;
}

function poseidonPair(left, right) {
  return normalizeHex(poseidonHashMany([BigInt(left), BigInt(right)]));
}

function createCacheEntry() {
  return {
    value: null,
    expiresAt: 0,
  };
}

function getCachedValue(entry) {
  return entry.expiresAt > Date.now() ? entry.value : null;
}

async function withTimedCache(entry, loader, ttlMs = CACHE_TTL_MS) {
  const cached = getCachedValue(entry);
  if (cached !== null) return cached;

  const value = await loader();
  entry.value = value;
  entry.expiresAt = Date.now() + ttlMs;
  return value;
}

async function readRawBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function proxyRpc({ method, pathname, search, body, headers }) {
  let lastError;

  for (let attempt = 0; attempt < config.upstreams.length; attempt += 1) {
    const index = (activeUpstreamIndex + attempt) % config.upstreams.length;
    const upstream = `${config.upstreams[index]}${pathname}${search}`;

    try {
      const response = await fetch(upstream, {
        method,
        headers: {
          'content-type': headers['content-type'] ?? 'application/json',
        },
        body: method === 'GET' ? undefined : body,
      });

      activeUpstreamIndex = index;
      const responseBody = Buffer.from(await response.arrayBuffer());
      return {
        status: response.status,
        headers: {
          'Content-Type': response.headers.get('content-type') ?? 'application/json',
        },
        body: responseBody,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Unable to reach Starknet RPC upstream');
}

async function withProvider(action) {
  let lastError;

  for (let attempt = 0; attempt < config.upstreams.length; attempt += 1) {
    const index = (activeUpstreamIndex + attempt) % config.upstreams.length;
    const upstream = config.upstreams[index];
    const provider = new RpcProvider({ nodeUrl: upstream });

    try {
      const result = await action(provider, upstream);
      activeUpstreamIndex = index;
      return result;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('Unable to query Starknet RPC upstream');
}

async function withAccount(action) {
  if (!isConfiguredAddress(config.deployerAddress) || !config.deployerPrivateKey) {
    throw new Error('Faucet signer is not configured');
  }

  return withProvider(async (provider) => {
    const account = new Account({
      provider,
      address: config.deployerAddress,
      signer: config.deployerPrivateKey,
    });

    return action({ provider, account });
  });
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

async function getAuctions() {
  if (!isConfiguredAddress(config.sealedAuction)) return [];

  return withTimedCache(caches.auctions, () =>
    withProvider(async (provider) => {
      const contract = new Contract({
        abi: abis.sealedAuction,
        address: config.sealedAuction,
        providerOrAccount: provider,
      });
      const countResult = await contract.call('get_auction_count');
      const count = Number(countResult);
      const createdEvents = await getAllEvents(provider, {
        address: config.sealedAuction,
        from_block: { block_number: config.startBlock },
        to_block: 'latest',
        keys: [[selectors.auctionCreated]],
      });

      const createdAtById = new Map();
      for (const event of createdEvents) {
        const [auctionId, , timestamp] = event.data.map(normalizeHex);
        createdAtById.set(BigInt(auctionId).toString(), Number(BigInt(timestamp)));
      }

      const auctions = [];
      for (let index = 0; index < count; index += 1) {
        const auctionId = BigInt(index);
        const auction = await contract.call('get_auction', [auctionId]);
        const bidCount = await contract.call('get_bid_count', [auctionId]);
        const reservePrice = await contract.call('get_auction_reserve_price', [auctionId]);
        const highestBid = await contract.call('get_highest_bid', [auctionId]);

        auctions.push({
          id: auctionId.toString(),
          state: parseEnum(auction[0]),
          commitEnd: Number(auction[1]),
          revealEnd: Number(auction[2]),
          creator: normalizeHex(auction[3]),
          assetId: normalizeHex(auction[4]),
          bidCount: BigInt(bidCount).toString(),
          createdAt: createdAtById.get(auctionId.toString()) ?? undefined,
          reservePrice: parseU256(reservePrice).toString(),
          currentWinner: normalizeHex(highestBid[0]),
          currentBid: parseU256(highestBid[1]).toString(),
        });
      }

      return auctions;
    }),
  );
}

async function getOrderFills(limit) {
  if (!isConfiguredAddress(config.darkOrderbook)) return [];

  const cacheKey = `${limit}`;
  const entry = caches.fills.get(cacheKey) ?? createCacheEntry();
  caches.fills.set(cacheKey, entry);

  return withTimedCache(entry, () =>
    withProvider(async (provider) => {
      const fillEvents = await getAllEvents(provider, {
        address: config.darkOrderbook,
        from_block: { block_number: config.startBlock },
        to_block: 'latest',
        keys: [[selectors.orderFilled]],
      });

      return fillEvents
        .slice(-limit)
        .reverse()
        .map((event) => ({
          orderId: normalizeHex(event.data[0]),
          fillProof: normalizeHex(event.data[1]),
          timestamp: Number(BigInt(normalizeHex(event.data[2]))),
          blockNumber: event.block_number,
          transactionHash: normalizeHex(event.transaction_hash),
        }));
    }),
  );
}

async function getProof(commitment) {
  if (!isConfiguredAddress(config.notePool)) {
    throw new Error('Note pool address is not configured');
  }

  const normalizedCommitment = normalizeHex(commitment);
  const entry = caches.proofs.get(normalizedCommitment) ?? createCacheEntry();
  caches.proofs.set(normalizedCommitment, entry);

  return withTimedCache(entry, () =>
    withProvider(async (provider) => {
      const noteEvents = await getAllEvents(provider, {
        address: config.notePool,
        from_block: { block_number: config.startBlock },
        to_block: 'latest',
        keys: [[selectors.noteDeposited, selectors.noteTransferred]],
      });

      const leaves = [];
      for (const event of noteEvents) {
        const selector = normalizeHex(event.keys[0]);
        if (selector === selectors.noteDeposited) {
          leaves.push(normalizeHex(event.data[0]));
        }
        if (selector === selectors.noteTransferred) {
          leaves.push(normalizeHex(event.data[1]));
        }
      }

      const leafIndex = leaves.findIndex((leaf) => leaf === normalizedCommitment);
      if (leafIndex === -1) {
        throw new Error(`Commitment ${normalizedCommitment} not found in note tree`);
      }

      const proof = [];
      let currentIndex = leafIndex;
      let levelNodes = [...leaves];

      for (let level = 0; level < 20; level += 1) {
        const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
        proof.push(levelNodes[siblingIndex] ?? ZERO_VALUE);

        const nextLevel = [];
        for (let index = 0; index < Math.max(levelNodes.length, 1); index += 2) {
          const left = levelNodes[index] ?? ZERO_VALUE;
          const right = levelNodes[index + 1] ?? ZERO_VALUE;
          nextLevel.push(poseidonPair(left, right));
        }

        levelNodes = nextLevel;
        currentIndex = Math.floor(currentIndex / 2);
      }

      return {
        commitment: normalizedCommitment,
        root: levelNodes[0] ?? ZERO_VALUE,
        proof,
        indices: leafIndex,
      };
    }),
    60_000,
  );
}

async function claimFaucet(payload) {
  const recipient = normalizeHex(payload.recipient);
  const tokenAddress = normalizeHex(payload.tokenAddress);
  const amount = parsePositiveBigInt(payload.amount);
  if (!isConfiguredAddress(recipient)) {
    throw new Error('Recipient address is invalid');
  }

  const faucetToken = getFaucetTokenConfig(tokenAddress);
  if (!faucetToken) {
    throw new Error('Requested faucet token is not supported');
  }
  if (amount > faucetToken.maxAmount) {
    throw new Error(
      `Requested amount exceeds the faucet limit for ${faucetToken.symbol}.`,
    );
  }

  const cooldownKey = `${recipient.toLowerCase()}:${tokenAddress.toLowerCase()}`;
  const lastClaimAt = caches.faucetClaims.get(cooldownKey) ?? 0;
  if (Date.now() - lastClaimAt < config.faucetCooldownMs) {
    throw new Error('Faucet cooldown active. Please wait before requesting more liquidity.');
  }

  return withAccount(async ({ provider, account }) => {
    const result = await account.execute([
      {
        contractAddress: tokenAddress,
        entrypoint: 'transfer',
        calldata: [recipient, ...toUint256Calldata(amount)],
      },
    ]);

    await provider.waitForTransaction(result.transaction_hash);
    caches.faucetClaims.set(cooldownKey, Date.now());

    return {
      ok: true,
      transactionHash: normalizeHex(result.transaction_hash),
      recipient,
      tokenAddress,
      amount: amount.toString(),
    };
  });
}

function parsePositiveBigInt(value) {
  const amount = BigInt(value);
  if (amount <= 0n) {
    throw new Error('Amount must be greater than zero');
  }
  return amount;
}

function toUint256Calldata(value) {
  const lowMask = (1n << 128n) - 1n;
  return [(value & lowMask).toString(), (value >> 128n).toString()];
}

function getFaucetTokenConfig(tokenAddress) {
  const normalized = tokenAddress.toLowerCase();
  if (normalized === config.wbtc.toLowerCase()) {
    return { symbol: 'WBTC', maxAmount: DEFAULT_FAUCET_LIMITS.WBTC };
  }
  if (normalized === config.usdc.toLowerCase()) {
    return { symbol: 'USDC', maxAmount: DEFAULT_FAUCET_LIMITS.USDC };
  }
  return null;
}
