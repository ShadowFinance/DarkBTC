import {
  Account,
  Contract,
  RpcProvider,
  cairo,
} from '../frontend/node_modules/starknet/dist/index.mjs';
import {
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

  const { recipient, wbtcAmount, usdcAmount } = parseArgs(process.argv.slice(2));

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const account = new Account({
    provider,
    address,
    signer: privateKey,
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

  if (wbtcAmount > 0n) {
    await waitFor(provider, await wbtc.transfer(recipient, cairo.uint256(wbtcAmount)), `Fund WBTC to ${recipient}`);
  }

  if (usdcAmount > 0n) {
    await waitFor(provider, await usdc.transfer(recipient, cairo.uint256(usdcAmount)), `Fund USDC to ${recipient}`);
  }

  console.log(
    JSON.stringify(
      {
        recipient,
        network: NETWORK,
        wbtc: wbtcAmount.toString(),
        usdc: usdcAmount.toString(),
      },
      null,
      2,
    ),
  );
}

function parseArgs(args) {
  let recipient;
  let wbtc = '10';
  let usdc = '100000';

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === '--recipient') recipient = args[index + 1];
    if (current === '--wbtc') wbtc = args[index + 1];
    if (current === '--usdc') usdc = args[index + 1];
  }

  if (!recipient) {
    throw new Error('Usage: node scripts/faucet.mjs --recipient <address> [--wbtc 10] [--usdc 100000]');
  }

  return {
    recipient: normalizeHex(recipient),
    wbtcAmount: parseUnits(wbtc, 18),
    usdcAmount: parseUnits(usdc, 18),
  };
}

function parseUnits(value, decimals) {
  const [whole, fraction = ''] = String(value).split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(paddedFraction || '0');
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
