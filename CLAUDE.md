# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# luci-app-starlink-panel — GL.iNet 4.x Port

## Project overview

OpenWrt LuCI package (`luci-app-starlink-panel`) providing a Starlink dish dashboard,
ported to **GL.iNet 4.x firmware** (GL-iNet Beryl AX / MT-3000, OpenWrt 21.02-SNAPSHOT,
mediatek/mt7981). Packaged as an **IPK** for `opkg`.
**Current release: v1.0.0-r22**

**GitHub:** https://github.com/bigmalloy/gl-mt3000-starlink-panel
**Remote:** `glinet` (`git push glinet main`)

Companion Rust binary (`starlink-dish`) handles gRPC communication with the dish at
`192.168.100.1:9200`. Supports `dish` (full telemetry) and `reboot` commands.

## GL.iNet OUI architecture

GL.iNet 4.x uses a **custom nginx+Lua web framework** (OUI) on port 80/443 — NOT
standard OpenWrt uhttpd/rpcd. LuCI Advanced runs on port 8080/8443 via uhttpd.

| Component | Path |
|-----------|------|
| Lua RPC backends | `/usr/lib/oui-httpd/rpc/{object}` |
| Vue.js view components | `/www/views/gl-sdk4-ui-{view}.common.js.gz` (must be gzipped) |
| Menu entries | `/usr/share/oui/menu.d/{name}.json` |
| nginx RPC handler | `/usr/share/gl-ngx/oui-rpc.lua` |

**Object name rule:** `^[%a_][%w%-_]+$` — NO DOTS. `luci.foo` is invalid; use `foo`.
**Admin session:** `aclgroup = "root"` → always allowed. No ACL check needed for admin.
**JS format:** Must use `module.exports = (function(){...})()` (CommonJS, not bare IIFE).
**RPC call:** `window.$rpcRequest('call', ['sid', 'objectname', 'method', {}])`

## Repository layout

```
Makefile                              # OpenWrt Makefile — builds the IPK
files/
  oui-rpc-starlink.lua               # GL.iNet OUI Lua RPC backend → /usr/lib/oui-httpd/rpc/starlink
  gl-sdk4-ui-starlink.common.js      # GL.iNet OUI Vue.js view (gzipped on install)
  starlink-oui-menu.json             # GL.iNet OUI menu entry → /usr/share/oui/menu.d/starlink.json
  starlink-acl.json                  # rpcd ACL (for LuCI Advanced compatibility)
  luci.starlink-panel                # rpcd shell backend → /usr/libexec/rpcd/
  status.js                          # LuCI Advanced JS view
  luci-app-starlink-panel-*.json     # LuCI menu + ACL
  install-grpcurl.sh                 # postinst helper: downloads starlink-dish binary
rust-src/
  src/main.rs                        # starlink-dish Rust binary
  Cargo.toml / Cargo.lock
build-ipk-docker.sh                  # builds the IPK using openwrt/sdk Docker image
build-rust-cross.sh                  # cross-compiles starlink-dish for aarch64-musl
output/                              # built IPKs and starlink-dish binary land here
```

## Build commands

### Build the IPK
```sh
./build-ipk-docker.sh
# Output: output/luci-app-starlink-panel_1.0.0-22_all.ipk
```
Uses `openwrt/sdk:aarch64_cortex-a53-23.05.5` Docker image. The SDK version (23.05.5)
differs from the router firmware (21.02-SNAPSHOT) but this is intentional — `PKGARCH:=all`
means the IPK contains no compiled code and is version-agnostic.

### Cross-compile starlink-dish binary
```sh
./build-rust-cross.sh
# Output: output/starlink-dish  (aarch64 musl, ~1.4 MB stripped)
```
Uses `messense/rust-musl-cross:aarch64-musl` Docker image with protoc 21.12.

### Deploy to router
```sh
# Copy and install IPK
scp -O output/luci-app-starlink-panel_*.ipk root@192.168.1.1:/tmp/
ssh root@192.168.1.1 'opkg install --force-depends /tmp/luci-app-starlink-panel_*.ipk'

# Force-push locally built starlink-dish binary directly (skips download):
scp -O output/starlink-dish root@192.168.1.1:/usr/bin/starlink-dish

# Or let postinst download it:
ssh root@192.168.1.1 '/usr/bin/install-grpcurl'
```

### Quick iteration — JS/Lua changes only (no IPK rebuild needed)
```sh
# Push JS view update (gzip on the fly):
gzip -c files/gl-sdk4-ui-starlink.common.js | ssh root@192.168.1.1 'cat > /www/views/gl-sdk4-ui-starlink.common.js.gz'

# Push Lua RPC backend update:
scp -O files/oui-rpc-starlink.lua root@192.168.1.1:/usr/lib/oui-httpd/rpc/starlink
```
GL.iNet OUI serves JS directly from the filesystem — no cache clear or service restart needed.
Lua changes also take effect immediately (nginx re-reads on each request).

### Release process
1. Bump `PKG_RELEASE` in `Makefile`
2. `./build-ipk-docker.sh`
3. If Rust changed: `./build-rust-cross.sh`
4. `git commit && git push glinet main`
5. `gh release create v1.0.0-rNN output/luci-app-starlink-panel_*.ipk --repo bigmalloy/gl-mt3000-starlink-panel --title "v1.0.0-rNN" --notes "..."`

### Debugging on the router
```sh
ssh root@192.168.1.1 'starlink-dish dish'       # test binary + dish connectivity
ssh root@192.168.1.1 'logread | grep starlink'  # nginx/Lua errors land here
```

## Key design decisions

### GL.iNet OUI vs rpcd
- GL.iNet OUI uses `/usr/lib/oui-httpd/rpc/starlink` (Lua) — completely separate from rpcd
- rpcd backends (`/usr/libexec/rpcd/`) are still installed for LuCI Advanced mode only
- Object name `starlink` (no dots) required by GL.iNet Lua regex validator
- JS view calls `window.$rpcRequest('call', ['sid', 'starlink', 'dish', {}])`

### JS view constraints
The view runs inside GL.iNet OUI which provides **Vue 2** globally. The file must be:
- CommonJS (`module.exports = (function(){...})()`) — not ESM, not bare IIFE
- Using Vue 2's `render(h)` function — no `<template>`, no SFC, no JSX
- All DOM nodes constructed via `h('tag', { style/attrs/on }, [...children])` calls

### Lua backend constraints
`oui-rpc-starlink.lua` runs inside nginx (via `oui-rpc.lua`), not rpcd.
- `cjson` is available for JSON encode/decode
- `io.popen()` is available for shelling out to `starlink-dish`
- Return value is JSON-encoded and sent directly as the RPC response

### starlink-dish replaces grpcurl
- grpcurl is ~15 MB; starlink-dish is 1.4 MB statically linked
- Uses `starlink-grpc-client` crate (tonic 0.9 / prost 0.11) — proto defs included
- Default address is `http://192.168.100.1:9200`
- Usage: `starlink-dish dish` and `starlink-dish reboot`; override with `-d <url>`
- `install-grpcurl.sh` is misleadingly named (legacy) — it installs `starlink-dish`

### Gen3 dish quirks
- `disablement_code = 1` (UNKNOWN_REASON) reported even when fully connected
- Fix: treat code 1 as OKAY when `rs_rf = true` (see `rust-src/src/main.rs`)
- State field omitted on wire when CONNECTED (proto3 zero-value omission)

### Postinst behaviour
- rpcd restarts synchronously in postinst
- starlink-dish download runs fully detached via `setsid ... &`
- GL.iNet OUI does NOT need a cache clear (serves JS from filesystem directly)

## Router details (test device)

| Field | Value |
|-------|-------|
| Device | GL-iNet Beryl AX (MT-3000) |
| SoC | MediaTek MT7981 (aarch64) |
| SSH | `root@192.168.1.1` (key auth) |
| Firmware | GL.iNet 4.x (OpenWrt 21.02-SNAPSHOT) |
| Package manager | `opkg` (IPK format) |
| Web UI | GL.iNet OUI on port 80 (nginx+Lua), LuCI on port 8080 (uhttpd) |
| Starlink | Gen3 rev4_panda_prod2 (AU) |
| Dish IP | 192.168.100.1:9200 |
