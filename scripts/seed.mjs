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

  const auction = new Contract({
    abi: loadArtifact('SealedAuction', '.contract_class.json').abi,
    address: deployments.contracts.SealedAuction.address,
    providerOrAccount: account,
  });
  const orderbook = new Contract({
    abi: loadArtifact('DarkOrderbook', '.contract_class.json').abi,
    address: deployments.contracts.DarkOrderbook.address,
    providerOrAccount: account,
  });
  const usdc = new Contract({
    abi: loadArtifact('MockERC20', '.contract_class.json').abi,
    address: deployments.tokens.USDC.address,
    providerOrAccount: account,
  });

  const reserveOne = 25_000n * 10n ** 18n;
  const reserveTwo = 22_500n * 10n ** 18n;
  const reserveThree = 20_000n * 10n ** 18n;

  const activeAuctionId = await createAuction(
    provider,
    auction,
    deployments.tokens.WBTC.address,
    reserveOne,
    3600,
    7200,
    'Active auction',
  );

  await commitBid({
    provider,
    auction,
    usdc,
    auctionAddress: deployments.contracts.SealedAuction.address,
    auctionId: activeAuctionId,
    bidAmount: 27_500n * 10n ** 18n,
    reservePrice: reserveOne,
    label: 'Seed active auction bid',
  });

  const revealAuctionId = await createAuction(
    provider,
    auction,
    deployments.tokens.WBTC.address,
    reserveTwo,
    0,
    3600,
    'Reveal-phase auction',
  );
  await waitFor(provider, await auction.advance_phase(revealAuctionId), 'Advance reveal auction to reveal phase');

  const settledAuctionId = await createAuction(
    provider,
    auction,
    deployments.tokens.WBTC.address,
    reserveThree,
    0,
    0,
    'Settled auction',
  );
  await waitFor(provider, await auction.advance_phase(settledAuctionId), 'Advance settled auction to reveal phase');
  await waitFor(provider, await auction.advance_phase(settledAuctionId), 'Settle final seeded auction');

  const collateralBase = 12_500n * 10n ** 18n;
  for (let index = 0; index < 5; index += 1) {
    const collateralAmount = collateralBase + BigInt(index) * 500n * 10n ** 18n;
    const orderCommitment = normalizeHex(0xabc100n + BigInt(index));
    const fillProof = normalizeHex(0xdef200n + BigInt(index));

    await waitFor(provider, await usdc.approve(deployments.contracts.DarkOrderbook.address, cairo.uint256(collateralAmount)), `Approve order collateral #${index + 1}`);
    await waitFor(
      provider,
      await orderbook.submit_order(
        orderCommitment,
        deployments.tokens.WBTC.address,
        cairo.uint256(collateralAmount),
        deployments.tokens.USDC.address,
      ),
      `Submit seeded order #${index + 1}`,
    );

    if (index < 3) {
      await waitFor(
        provider,
        await orderbook.fill_order(
          orderCommitment,
          fillProof,
          cairo.uint256(1n * 10n ** 18n),
          cairo.uint256((30_000n + BigInt(index) * 1_000n) * 10n ** 18n),
          address,
        ),
        `Fill seeded order #${index + 1}`,
      );
    }
  }

  console.log('Seed complete.');
}

async function createAuction(provider, auction, assetId, reservePrice, commitDuration, revealDuration, label) {
  const tx = await auction.create_auction(
    assetId,
    cairo.uint256(reservePrice),
    commitDuration,
    revealDuration,
  );
  await waitFor(provider, tx, label);

  const count = await auction.get_auction_count();
  return BigInt(count) - 1n;
}

async function commitBid({ provider, auction, usdc, auctionAddress, auctionId, bidAmount, reservePrice, label }) {
  const secret = 0x123456n + auctionId;
  const commitment = normalizeHex(
    hash.computePoseidonHashOnElements([
      bidAmount & ((1n << 128n) - 1n),
      bidAmount >> 128n,
      secret,
      asciiDomain('DARKBTC_BID'),
    ]),
  );

  await waitFor(provider, await usdc.approve(auctionAddress, cairo.uint256(reservePrice)), `${label} approve`);
  await waitFor(provider, await auction.commit_bid(auctionId, commitment), label);
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
