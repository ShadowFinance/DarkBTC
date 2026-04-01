import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Account, RpcProvider, Contract } from 'starknet';

dotenv.config();

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const address = process.env.DEPLOYER_ADDRESS;
  const rpcUrl = process.env.RPC_URL ?? 'https://api.cartridge.gg/x/starknet/sepolia';

  if (!privateKey || !address) {
    throw new Error('DEPLOYER_PRIVATE_KEY and DEPLOYER_ADDRESS must be set in .env');
  }

  const deploymentsPath = path.join(__dirname, '../deployments/sepolia.json');
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error('Run deploy.ts first to generate deployments/sepolia.json');
  }

  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf-8')) as {
    contracts: Record<string, { address: string }>;
    tokens: Record<string, string>;
  };

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const account = new Account({
    provider,
    address,
    signer: privateKey,
  });

  const notePoolAddress = deployments.contracts.NotePool.address;
  const auctionAddress = deployments.contracts.SealedAuction.address;
  const wbtcAddress = deployments.tokens.WBTC;
  const usdcAddress = deployments.tokens.USDC;

  const notePoolAbi = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../abis/note_pool.json'), 'utf-8'),
  );
  const auctionAbi = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../abis/sealed_auction.json'), 'utf-8'),
  );

  const notePool = new Contract({
    abi: notePoolAbi,
    address: notePoolAddress,
    providerOrAccount: account,
  });
  const auction = new Contract({
    abi: auctionAbi,
    address: auctionAddress,
    providerOrAccount: account,
  });

  // Mint some test WBTC to deployer and deposit into pool
  console.log('Seeding NotePool with test deposits...');

  // Create test auctions
  console.log('Creating test auction...');
  const createResult = await auction.create_auction(
    '0x574254435f55534443', // BTC_USDC
    '1000000',              // 1 USDC reserve price
    '3600',                 // 1 hour commit phase
    '3600',                 // 1 hour reveal phase
  );
  await provider.waitForTransaction(createResult.transaction_hash);
  console.log('Test auction created. TX:', createResult.transaction_hash);

  console.log('Seed complete!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
