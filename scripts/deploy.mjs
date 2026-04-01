import {
  Account,
  CallData,
  Contract,
  RpcProvider,
  byteArray,
  cairo,
} from '../frontend/node_modules/starknet/dist/index.mjs';
import {
  loadArtifact,
  loadEnv,
  normalizeHex,
  requireEnv,
  saveDeployments,
  syncAbi,
  writeFrontendEnv,
} from './lib/common.mjs';

const NETWORK = 'sepolia';
const MOCK_TOKEN_DECIMALS = 18;

async function main() {
  const env = loadEnv();
  const rpcUrl = env.RPC_URL ?? env.RPC_UPSTREAMS?.split(',')[0] ?? 'https://api.cartridge.gg/x/starknet/sepolia';
  const privateKey = requireEnv(env, 'DEPLOYER_PRIVATE_KEY');
  const address = requireEnv(env, 'DEPLOYER_ADDRESS');

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const account = new Account({
    provider,
    address,
    signer: privateKey,
  });

  const blockNumber = await provider.getBlockNumber();
  console.log(`Deploying DarkBTC from ${address} at block ${blockNumber}`);

  syncProtocolAbis();

  const mockTokenClassHash = await declareContract(account, provider, 'MockERC20');
  const notePoolClassHash = await declareContract(account, provider, 'NotePool');
  const shieldedSwapClassHash = await declareContract(account, provider, 'ShieldedSwap');
  const sealedAuctionClassHash = await declareContract(account, provider, 'SealedAuction');
  const darkOrderbookClassHash = await declareContract(account, provider, 'DarkOrderbook');

  const wbtcAddress = env.WBTC_ADDRESS || (await deployMockToken({
    account,
    provider,
    classHash: mockTokenClassHash,
    name: 'Wrapped Bitcoin',
    symbol: 'WBTC',
    supply: 1_000_000n * 10n ** 18n,
    recipient: address,
  }));

  const usdcAddress = env.USDC_ADDRESS || (await deployMockToken({
    account,
    provider,
    classHash: mockTokenClassHash,
    name: 'USD Coin',
    symbol: 'USDC',
    supply: 500_000_000n * 10n ** 18n,
    recipient: address,
  }));

  const notePoolAddress = await deployContract({
    account,
    provider,
    classHash: notePoolClassHash,
    constructorCalldata: [address],
    label: 'NotePool',
  });

  const shieldedSwapAddress = await deployContract({
    account,
    provider,
    classHash: shieldedSwapClassHash,
    constructorCalldata: [notePoolAddress, address],
    label: 'ShieldedSwap',
  });

  const sealedAuctionAddress = await deployContract({
    account,
    provider,
    classHash: sealedAuctionClassHash,
    constructorCalldata: [address, usdcAddress],
    label: 'SealedAuction',
  });

  const darkOrderbookAddress = await deployContract({
    account,
    provider,
    classHash: darkOrderbookClassHash,
    constructorCalldata: [],
    label: 'DarkOrderbook',
  });

  const notePool = new Contract({
    abi: loadArtifact('NotePool', '.contract_class.json').abi,
    address: notePoolAddress,
    providerOrAccount: account,
  });
  const wbtc = new Contract({
    abi: loadArtifact('MockERC20', '.contract_class.json').abi,
    address: wbtcAddress,
    providerOrAccount: account,
  });
  const usdc = new Contract({
    abi: loadArtifact('MockERC20', '.contract_class.json').abi,
    address: usdcAddress,
    providerOrAccount: account,
  });
  const shieldedSwap = new Contract({
    abi: loadArtifact('ShieldedSwap', '.contract_class.json').abi,
    address: shieldedSwapAddress,
    providerOrAccount: account,
  });

  await invokeAndWait(provider, await notePool.add_supported_asset(wbtcAddress), 'Register WBTC');
  await invokeAndWait(provider, await notePool.add_supported_asset(usdcAddress), 'Register USDC');

  const liquidityBtc = 25n * 10n ** 18n;
  const liquidityUsdc = 1_500_000n * 10n ** 18n;

  await invokeAndWait(provider, await wbtc.approve(shieldedSwapAddress, cairo.uint256(liquidityBtc)), 'Approve WBTC liquidity');
  await invokeAndWait(provider, await usdc.approve(shieldedSwapAddress, cairo.uint256(liquidityUsdc)), 'Approve USDC liquidity');
  await invokeAndWait(
    provider,
    await shieldedSwap.add_shielded_liquidity(
      wbtcAddress,
      usdcAddress,
      cairo.uint256(liquidityBtc),
      cairo.uint256(liquidityUsdc),
      '0x111',
      '0x222',
    ),
    'Seed ShieldedSwap liquidity',
  );

  const deployments = {
    network: NETWORK,
    rpcUrl,
    blockNumber,
    contracts: {
      NotePool: { address: notePoolAddress, classHash: notePoolClassHash },
      ShieldedSwap: { address: shieldedSwapAddress, classHash: shieldedSwapClassHash },
      SealedAuction: { address: sealedAuctionAddress, classHash: sealedAuctionClassHash },
      DarkOrderbook: { address: darkOrderbookAddress, classHash: darkOrderbookClassHash },
    },
    tokens: {
      WBTC: { address: wbtcAddress, decimals: MOCK_TOKEN_DECIMALS },
      USDC: { address: usdcAddress, decimals: MOCK_TOKEN_DECIMALS },
    },
    auctionDepositToken: usdcAddress,
  };

  saveDeployments(NETWORK, deployments);
  writeFrontendEnv({
    VITE_NOTE_POOL_ADDRESS: notePoolAddress,
    VITE_SHIELDED_SWAP_ADDRESS: shieldedSwapAddress,
    VITE_SEALED_AUCTION_ADDRESS: sealedAuctionAddress,
    VITE_DARK_ORDERBOOK_ADDRESS: darkOrderbookAddress,
    VITE_CHAIN_ID: 'SN_SEPOLIA',
    VITE_RPC_URL: '/rpc',
    VITE_INDEXER_URL: '/api',
    VITE_WBTC_ADDRESS: wbtcAddress,
    VITE_WBTC_DECIMALS: `${MOCK_TOKEN_DECIMALS}`,
    VITE_USDC_ADDRESS: usdcAddress,
    VITE_USDC_DECIMALS: `${MOCK_TOKEN_DECIMALS}`,
    VITE_AUCTION_DEPOSIT_TOKEN: usdcAddress,
  });

  console.log('Deployment complete.');
  console.log(JSON.stringify(deployments, null, 2));
}

function syncProtocolAbis() {
  syncAbi('NotePool', 'note_pool.json');
  syncAbi('ShieldedSwap', 'shielded_swap.json');
  syncAbi('SealedAuction', 'sealed_auction.json');
  syncAbi('DarkOrderbook', 'dark_orderbook.json');
}

async function declareContract(account, provider, contractName) {
  const contract = loadArtifact(contractName, '.contract_class.json');
  const casm = loadArtifact(contractName, '.compiled_contract_class.json');
  console.log(`Declaring ${contractName}...`);
  const result = await account.declareIfNot({ contract, casm });
  if (result.transaction_hash) {
    await invokeAndWait(provider, result, `Declare ${contractName}`);
  } else {
    console.log(`${contractName} already declared as ${result.class_hash}`);
  }
  return result.class_hash;
}

async function deployMockToken({ account, provider, classHash, name, symbol, supply, recipient }) {
  return deployContract({
    account,
    provider,
    classHash,
    label: symbol,
    constructorCalldata: CallData.compile({
      name: byteArray.byteArrayFromString(name),
      symbol: byteArray.byteArrayFromString(symbol),
      initial_supply: cairo.uint256(supply),
      recipient,
    }),
  });
}

async function deployContract({ account, provider, classHash, constructorCalldata, label }) {
  console.log(`Deploying ${label}...`);
  const result = await account.deployContract({
    classHash,
    constructorCalldata,
  });
  await invokeAndWait(provider, result, `Deploy ${label}`);
  console.log(`${label} deployed at ${result.contract_address}`);
  return normalizeHex(result.contract_address);
}

async function invokeAndWait(provider, tx, label) {
  const hash = tx.transaction_hash;
  if (!hash) {
    throw new Error(`Missing transaction hash while waiting for ${label}`);
  }
  console.log(`${label} submitted: ${hash}`);
  await provider.waitForTransaction(hash);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
