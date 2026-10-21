# Virtual Office sync agent

For biometric devices that can't push to the cloud. Run it on one office PC that's always on and on the same network as the devices. Every minute it reads each device's attendance log and uploads new punches. It also checks every 15 seconds for HR's "Sync now".

## Set up

1. In the Virtual Office, open **Biometric devices**, add the device with connection **Office sync agent**, and copy the access token it shows. Do this once per device.
2. Copy `config.example.json` to `config.json` and fill it in:
   - `apiUrl`: the Virtual Office API address, ending in `/api`. It must use `https://` (plain `http://` is only allowed for `localhost` while testing).
   - one entry per device:
     - `"type": "zkteco"` with the device's `ip` (port `4370` by default). This works with ZKTeco terminals and most rebrands that use the same protocol.
     - `"type": "folder"` with a `path` where exported `.dat`/`.txt` attendance logs are saved, for units that only export to USB.
3. Run it:
   ```
   node dist/index.js --config config.json
   ```
   or once (for Windows Task Scheduler): `node dist/index.js --config config.json --once`.

The device shows **Online** in Biometric devices within a minute. `sync-state.json` (next to the config) remembers the last punch uploaded. Each run re-sends the last 48 hours (`overlapHours`) and the server skips anything it already has, so nothing is lost if the PC was off.

**Keep the PC's clock and time zone the same as the devices'.** Device times have no time zone, so the server reads them in the zone set for the device in Biometric devices.

## Build

```
pnpm --filter @vo/sync-agent build       # dist/index.js, needs Node 22 on the PC
pnpm --filter @vo/sync-agent build:exe   # release/vo-sync-agent.exe, no Node needed
```

`build:exe` downloads a Windows Node.js base binary the first time it runs, so it needs internet access to GitHub.

## Not yet verified

The ZKTeco reader uses `zkteco-js` and hasn't been tested against a real terminal yet. That waits on knowing the brand and model. The folder mode and the upload path are tested.
