import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Account, RpcProvider, json } from 'starknet';

dotenv.config();

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const address = process.env.DEPLOYER_ADDRESS;
  const rpcUrl = process.env.RPC_URL ?? 'https://api.cartridge.gg/x/starknet/sepolia';
  const wbtcAddress = process.env.WBTC_ADDRESS ?? '0x0';
  const usdcAddress = process.env.USDC_ADDRESS ?? '0x0';

  if (!privateKey || !address) {
    throw new Error('DEPLOYER_PRIVATE_KEY and DEPLOYER_ADDRESS must be set in .env');
  }

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const account = new Account({
    provider,
    address,
    signer: privateKey,
  });

  const targetDir = path.join(__dirname, '../contracts/target/dev');

  function loadSierra(name: string) {
    const files = fs.readdirSync(targetDir).filter((f) => f.includes(name) && f.endsWith('.contract_class.json'));
    if (!files[0]) throw new Error(`Sierra JSON not found for ${name}`);
    return json.parse(fs.readFileSync(path.join(targetDir, files[0]), 'utf-8'));
  }

  function loadCasm(name: string) {
    const files = fs.readdirSync(targetDir).filter((f) => f.includes(name) && f.endsWith('.compiled_contract_class.json'));
    if (!files[0]) throw new Error(`CASM JSON not found for ${name}`);
    return json.parse(fs.readFileSync(path.join(targetDir, files[0]), 'utf-8'));
  }

  const blockNumber = await provider.getBlockNumber();
  const deployerAddress = address;

  console.log(`Deploying from block ${blockNumber}...`);

  // 1. Deploy NotePool
  console.log('Declaring NotePool...');
  const notePoolSierra = loadSierra('NotePool');
  const notePoolCasm = loadCasm('NotePool');
  const { class_hash: notePoolClassHash } = await account.declare({ contract: notePoolSierra, casm: notePoolCasm });
  console.log('NotePool class hash:', notePoolClassHash);

  const notePoolResult = await account.deployContract({
    classHash: notePoolClassHash,
    constructorCalldata: [deployerAddress],
  });
  await provider.waitForTransaction(notePoolResult.transaction_hash);
  const notePoolAddress = notePoolResult.contract_address;
  console.log('NotePool deployed at:', notePoolAddress);

  // 2. Deploy ShieldedSwap
  console.log('Declaring ShieldedSwap...');
  const swapSierra = loadSierra('ShieldedSwap');
  const swapCasm = loadCasm('ShieldedSwap');
  const { class_hash: swapClassHash } = await account.declare({ contract: swapSierra, casm: swapCasm });

  const swapResult = await account.deployContract({
    classHash: swapClassHash,
    constructorCalldata: [notePoolAddress, deployerAddress],
  });
  await provider.waitForTransaction(swapResult.transaction_hash);
  const swapAddress = swapResult.contract_address;
  console.log('ShieldedSwap deployed at:', swapAddress);

  // 3. Deploy SealedAuction
  console.log('Declaring SealedAuction...');
  const auctionSierra = loadSierra('SealedAuction');
  const auctionCasm = loadCasm('SealedAuction');
  const { class_hash: auctionClassHash } = await account.declare({ contract: auctionSierra, casm: auctionCasm });

  const auctionResult = await account.deployContract({
    classHash: auctionClassHash,
    constructorCalldata: [deployerAddress, usdcAddress],
  });
  await provider.waitForTransaction(auctionResult.transaction_hash);
  const auctionAddress = auctionResult.contract_address;
  console.log('SealedAuction deployed at:', auctionAddress);

  // 4. Deploy DarkOrderbook
  console.log('Declaring DarkOrderbook...');
  const orderbookSierra = loadSierra('DarkOrderbook');
  const orderbookCasm = loadCasm('DarkOrderbook');
  const { class_hash: orderbookClassHash } = await account.declare({ contract: orderbookSierra, casm: orderbookCasm });

  const orderbookResult = await account.deployContract({
    classHash: orderbookClassHash,
    constructorCalldata: [],
  });
  await provider.waitForTransaction(orderbookResult.transaction_hash);
  const orderbookAddress = orderbookResult.contract_address;
  console.log('DarkOrderbook deployed at:', orderbookAddress);

  // 5. Add supported assets to NotePool
  const { Contract } = await import('starknet');
  const notePoolAbi = JSON.parse(fs.readFileSync(path.join(__dirname, '../abis/note_pool.json'), 'utf-8'));
  const notePoolContract = new Contract({
    abi: notePoolAbi,
    address: notePoolAddress,
    providerOrAccount: account,
  });

  console.log('Adding WBTC as supported asset...');
  const addWbtcResult = await notePoolContract.add_supported_asset(wbtcAddress);
  await provider.waitForTransaction(addWbtcResult.transaction_hash);

  console.log('Adding USDC as supported asset...');
  const addUsdcResult = await notePoolContract.add_supported_asset(usdcAddress);
  await provider.waitForTransaction(addUsdcResult.transaction_hash);

  // 6. Write deployment artifacts
  const deployments = {
    network: 'sepolia',
    blockNumber,
    contracts: {
      NotePool: { address: notePoolAddress, classHash: notePoolClassHash },
      ShieldedSwap: { address: swapAddress, classHash: swapClassHash },
      SealedAuction: { address: auctionAddress, classHash: auctionClassHash },
      DarkOrderbook: { address: orderbookAddress, classHash: orderbookClassHash },
    },
    tokens: { WBTC: wbtcAddress, USDC: usdcAddress },
  };

  const deploymentsDir = path.join(__dirname, '../deployments');
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(deploymentsDir, 'sepolia.json'),
    JSON.stringify(deployments, null, 2),
  );
  console.log('Deployments written to deployments/sepolia.json');

  // 7. Write frontend .env.local
  const envLocal = `VITE_NOTE_POOL_ADDRESS=${notePoolAddress}
VITE_SHIELDED_SWAP_ADDRESS=${swapAddress}
VITE_SEALED_AUCTION_ADDRESS=${auctionAddress}
VITE_DARK_ORDERBOOK_ADDRESS=${orderbookAddress}
VITE_CHAIN_ID=SN_SEPOLIA
VITE_RPC_URL=${rpcUrl}
VITE_WBTC_ADDRESS=${wbtcAddress}
VITE_USDC_ADDRESS=${usdcAddress}
VITE_INDEXER_URL=http://localhost:3001
`;
  fs.writeFileSync(path.join(__dirname, '../frontend/.env.local'), envLocal);
  console.log('Frontend .env.local written');
  console.log('\nDeployment complete!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
