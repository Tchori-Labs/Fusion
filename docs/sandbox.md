# Sandbox Backends

## Linux `bubblewrap` backend

Fusion supports an opt-in Linux sandbox backend using `bubblewrap` (`bwrap`).

- Enable with `sandbox.backend = "bubblewrap"`
- Default remains `native`
- If unavailable, behavior follows `failureMode` (`fail-hard` or `fallback-native`)

### Install

- Debian/Ubuntu: `sudo apt install bubblewrap`
- Fedora: `sudo dnf install bubblewrap`

### Policy mapping

`policyToBwrapArgs()` translates sandbox policy into bwrap args:

- Writable binds (`--bind`): worktree path, pnpm store path, plus configured `allowedWritePaths`
- Read-only binds (`--ro-bind`): repo root (when distinct), system runtime paths (`/usr`, `/bin`, `/lib`, `/lib64`), TLS/DNS paths, and node binary directory
- Temporary filesystem: `--tmpfs /tmp`
- Working directory: `--chdir <worktreePath>`
- Network isolation: `allowNetwork=false` adds `--unshare-net`
- Environment isolation: `--clearenv` plus allowlisted passthrough (`PATH`, `HOME`, `USER`, `LANG`, `LC_*`, `NODE_*`, `npm_*`, `PNPM_*`, `CI`, `FUSION_*`)

### Port 4040 guard

Port 4040 is reserved for the production dashboard. Sandbox policy rejects `allowedPorts` containing `4040` unless `allowPort4040Override=true` is explicitly set.

### Fusion workflow defaults

Use `fusionWorktreePreset(ctx)` to get the standard Fusion-friendly defaults:

- Worktree writable
- pnpm store writable
- `.fusion/fusion.db` is not added to writable mounts

### Troubleshooting

If you see `bwrap: setting up uid map: Permission denied`, unprivileged user namespaces may be disabled by host policy/kernel settings. Enable user namespaces or use `sandbox.backend = "native"` as a fallback.

### Related settings

See `docs/settings-reference.md` for full sandbox settings schema and precedence.
