# peaqOS Network Reference

Contract addresses, RPC endpoints, and network constants for the `peaqos` CLI.

---

## agung testnet

| Parameter | Value |
|-----------|-------|
| `PEAQOS_NETWORK` | `testnet` |
| Chain ID | 9990 |
| `PEAQOS_RPC_URL` | `https://peaq-agung.api.onfinality.io/public` |
| `PEAQOS_MCR_API_URL` | `https://mcr.peaq.xyz` |
| Gas Station | Not available on testnet — fund via web faucet |
| Faucet | https://docs.peaq.xyz/peaqchain/build/getting-started/get-test-tokens (3 AGNG/day) |
| Block explorer | https://testnet.peaqscan.xyz/ |
| `IDENTITY_REGISTRY_ADDRESS` | `0x9E9463a65c7B74623b3b6Cdc39F71be7274e5971` |
| `IDENTITY_STAKING_ADDRESS` | `0x55f336714aDb0749DbFE33b057a1702405564E3d` |
| `EVENT_REGISTRY_ADDRESS` | `0x2DAD8905380993940e340C5cE6d313d5c2780040` |
| `MACHINE_NFT_ADDRESS` | `0xB41C2A4f1c19b6B06beaAce0F5CD8439e77C4b1c` |
| `DID_REGISTRY_ADDRESS` | `0x0000000000000000000000000000000000000800` |
| `BATCH_PRECOMPILE_ADDRESS` | `0x0000000000000000000000000000000000000805` |

## mainnet

| Parameter | Value |
|-----------|-------|
| `PEAQOS_NETWORK` | `mainnet` |
| Chain ID | 3338 |
| `PEAQOS_RPC_URL` | `https://peaq.api.onfinality.io/public` |
| `PEAQOS_MCR_API_URL` | `https://api.peaqos.io` |
| `PEAQOS_GAS_STATION_URL` | `https://depinstation.peaq.xyz` |
| `PEAQOS_ORCHESTRATION_URL` | `https://orchestration.peaq.xyz` |
| `IDENTITY_REGISTRY_ADDRESS` | `0xb53Af985765031936311273599389b5B68aC9956` |
| `IDENTITY_STAKING_ADDRESS` | `0x11c05A650704136786253e8685f56879A202b1C7` |
| `EVENT_REGISTRY_ADDRESS` | `0x43c6AF2E14dc1327dc3cc6c7117D1CD72fffEcbA` |
| `MACHINE_NFT_ADDRESS` | `0x2943F80e9DdB11B9Dd275499C661Df78F5F691F9` |
| `DID_REGISTRY_ADDRESS` | `0x0000000000000000000000000000000000000800` |
| `BATCH_PRECOMPILE_ADDRESS` | `0x0000000000000000000000000000000000000805` |

## Known issues

| Issue | Detail |
|-------|--------|
| `peaqos init` contract address mis-mapping | Known bug: contract address inputs can be silently mis-mapped when piped or entered quickly. Manually verify each variable in `.env` against the testnet values above before running `peaqos activate`. |
| DID precompile RPC quirk (agung) | Step 6 of `peaqos activate` may fail with `Web3RPCError` on agung. Non-blocking — re-run `activate` (idempotent). Machine is registered and bonded regardless. |
| MCR indexer lag | Up to 90s after first event before MCR API reflects on-chain state. Use `peaqos show machine <did> --json` for immediate chain-direct lookup. |
| Gas station unavailable on testnet | Expected. Use faucet + `--skip-funding` flag. |
