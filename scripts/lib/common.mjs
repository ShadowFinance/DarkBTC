import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, '..', '..');
export const CONTRACTS_TARGET_DIR = path.join(ROOT_DIR, 'contracts', 'target', 'dev');
export const DEPLOYMENTS_DIR = path.join(ROOT_DIR, 'deployments');

export function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const contents = readFileSync(filePath, 'utf8');
  return Object.fromEntries(
    contents
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, ''),
        ];
      }),
  );
}

export function loadEnv() {
  return {
    ...readEnvFile(path.join(ROOT_DIR, '.env')),
    ...readEnvFile(path.join(ROOT_DIR, 'frontend', '.env.local')),
    ...process.env,
  };
}

export function requireEnv(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function loadArtifact(contractName, suffix) {
  const filename = readdirSync(CONTRACTS_TARGET_DIR).find(
    (entry) => entry.includes(contractName) && entry.endsWith(suffix),
  );

  if (!filename) {
    throw new Error(`Missing ${suffix} artifact for ${contractName} in ${CONTRACTS_TARGET_DIR}`);
  }

  return loadJson(path.join(CONTRACTS_TARGET_DIR, filename));
}

export function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

export function saveDeployments(network, data) {
  ensureDir(DEPLOYMENTS_DIR);
  writeFileSync(
    path.join(DEPLOYMENTS_DIR, `${network}.json`),
    `${JSON.stringify(data, null, 2)}\n`,
  );
}

export function loadDeployments(network) {
  const filePath = path.join(DEPLOYMENTS_DIR, `${network}.json`);
  if (!existsSync(filePath)) {
    throw new Error(`Deployments file not found: ${filePath}`);
  }
  return loadJson(filePath);
}

export function writeFrontendEnv(values) {
  const filePath = path.join(ROOT_DIR, 'frontend', '.env.local');
  const contents = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  writeFileSync(filePath, `${contents}\n`);
}

export function syncAbi(contractName, outputName) {
  const contractClass = loadArtifact(contractName, '.contract_class.json');
  if (!contractClass.abi) {
    throw new Error(`Contract artifact for ${contractName} does not include an ABI`);
  }

  const serializedAbi = `${JSON.stringify(contractClass.abi, null, 2)}\n`;
  const rootAbiPath = path.join(ROOT_DIR, 'abis', outputName);
  const frontendAbiPath = path.join(ROOT_DIR, 'frontend', 'src', 'abis', outputName);

  writeFileSync(rootAbiPath, serializedAbi);
  writeFileSync(frontendAbiPath, serializedAbi);
}

export function normalizeHex(value) {
  if (typeof value === 'bigint') return `0x${value.toString(16)}`;
  if (typeof value === 'number') return `0x${value.toString(16)}`;
  if (typeof value !== 'string') return '0x0';
  return value.startsWith('0x') ? value : `0x${value}`;
}

export function asciiDomain(value) {
  return BigInt(
    `0x${Array.from(value)
      .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')}`,
  );
}
