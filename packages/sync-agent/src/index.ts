#!/usr/bin/env node
/**
 * Virtual Office sync agent. Run it on one always-on office PC:
 *   vo-sync-agent --config config.json          (keeps running, every intervalSeconds)
 *   vo-sync-agent --config config.json --once   (one pass, e.g. from Task Scheduler)
 */
import { dirname, join, resolve } from 'node:path';
import { Agent, ApiClient, loadState, saveState } from './agent';
import { loadConfig } from './config';

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--config');
  const configPath = resolve(i >= 0 ? args[i + 1] : 'config.json');
  const once = args.includes('--once');
  const config = loadConfig(configPath);
  const statePath = join(dirname(configPath), 'sync-state.json');
  const state = loadState(statePath);
  const agent = new Agent(config, new ApiClient(config.apiUrl), state);

  const run = async () => {
    const results = await agent.runOnce();
    saveState(statePath, state);
    return results;
  };

  console.log(`Virtual Office sync agent: ${config.devices.length} device(s), every ${config.intervalSeconds}s → ${config.apiUrl}`);
  const first = await run();
  if (once) {
    process.exitCode = first.every((r) => r.ok) ? 0 : 1;
    return;
  }
  let busy = false;
  const tick = async (force: boolean) => {
    if (busy) return;
    busy = true;
    try {
      if (force || (await agent.syncRequested())) await run();
    } finally {
      busy = false;
    }
  };
  // a full read every interval, and a quick "Sync now?" check every 15 seconds in between
  setInterval(() => void tick(true), config.intervalSeconds * 1000);
  setInterval(() => void tick(false), 15_000);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
