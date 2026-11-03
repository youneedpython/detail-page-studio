import { cleanupSuccessfulRun } from './workspace.mjs';
const args = process.argv.slice(2);
if (args.length !== 1) throw new Error('Usage: node scripts/orchestrator/cleanup.mjs <run-id>');
await cleanupSuccessfulRun(process.cwd(), args[0]);
