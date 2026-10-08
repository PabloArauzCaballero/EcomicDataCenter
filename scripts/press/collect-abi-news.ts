import { collectWordpress } from './abi/collect-wordpress';
import { buildAbi } from './abi/build';

async function main(): Promise<void> {
  if (!process.argv.includes('--offline')) await collectWordpress(process.argv.includes('--full'));
  buildAbi();
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
