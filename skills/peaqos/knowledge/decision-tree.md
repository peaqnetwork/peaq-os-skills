# Activation Mode Reference

Use this table to determine the correct `peaqos activate` mode for a given machine deployment.

## Self-managed vs proxy-managed

| Condition | Mode | `peaqos activate` flags |
|-----------|------|------------------------|
| Operator runs machine directly; single wallet controls everything | Self-managed | _(no extra flags)_ |
| Operator manages multiple machines each with their own key | Proxy-managed | `--for <machine-address> --machine-key <path>` |
| Machine is an IoT device or embedded system with its own key | Proxy-managed | `--for <machine-address> --machine-key <path>` |
| Cloud VM or server the operator fully controls | Self-managed | _(no extra flags)_ |

## Proxy mode preconditions

1. The operator wallet must already be registered on-chain in self mode before running proxy activation for any machine.
2. `--for` and `--machine-key` must always be used together — one without the other exits with code 1.
3. The address derived from the key file must match the `--for` address exactly.

## Key storage by use case

| Use case | Recommended approach |
|----------|---------------------|
| Development / testnet | Raw key in `.env` via `peaqos init` → choose `generate` |
| Early production | OWS encrypted vault: `pip install 'peaq-os-sdk[ows]'` then `peaqos init` → choose `wallet` |
| High-value production | KMS/Fireblocks/Safe — migrate before significant on-chain value accumulates |
