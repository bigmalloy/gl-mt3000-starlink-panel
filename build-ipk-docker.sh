#!/bin/bash
# build-ipk-docker.sh
# Builds luci-app-starlink-panel as an IPK for OpenWrt 23.05 (opkg) using the OpenWrt SDK in Docker.

set -e

PKG="luci-app-starlink-panel"
OPENWRT_VER="23.05.5"
ARCH="aarch64_cortex-a53"
SDK_IMAGE="openwrt/sdk:${ARCH}-${OPENWRT_VER}"

echo "================================================"
echo " Building ${PKG} IPK for OpenWrt ${OPENWRT_VER}"
echo " Target: ${ARCH} (GL-iNet Beryl AX / MT3000)"
echo "================================================"
echo ""

if ! docker info > /dev/null 2>&1; then
  echo "ERROR: Docker is not running."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "${SCRIPT_DIR}/output"

HOST_UID="$(id -u)"
HOST_GID="$(id -g)"

docker run --rm \
  -v "${SCRIPT_DIR}:/pkg-src:ro" \
  -v "${SCRIPT_DIR}/output:/output" \
  --user root \
  -e HOST_UID="${HOST_UID}" \
  -e HOST_GID="${HOST_GID}" \
  "${SDK_IMAGE}" \
  /bin/bash -c '
    set -e

    SDK_DIR="/builder"
    cd "$SDK_DIR"

    echo "--- Setting up package feed ---"
    mkdir -p package/luci-app-starlink-panel/files
    cp /pkg-src/Makefile package/luci-app-starlink-panel/Makefile
    cp /pkg-src/files/*  package/luci-app-starlink-panel/files/

    echo "--- Updating feeds ---"
    ./scripts/feeds update -a 2>&1 | tail -5
    ./scripts/feeds install -a 2>&1 | tail -5

    echo "--- Configuring ---"
    make defconfig 2>&1 | tail -3
    echo "CONFIG_PACKAGE_luci-app-starlink-panel=m" >> .config
    make defconfig 2>&1 | tail -3

    echo "--- Compiling ---"
    make package/luci-app-starlink-panel/compile V=s 2>&1 | tail -20

    echo "--- Copying output ---"
    IPK=$(find bin/ -name "luci-app-starlink-panel*.ipk" -type f | head -1)
    if [ -z "$IPK" ]; then
      echo "ERROR: No IPK found in bin/"
      find bin/ -name "*.ipk" | head -10
      exit 1
    fi
    cp "$IPK" /output/
    echo "Copied: $IPK"

    chown "${HOST_UID}:${HOST_GID}" /output/$(basename "$IPK")
    ls -lh /output/$(basename "$IPK")
  '

echo ""
echo "================================================"
ls -lh "${SCRIPT_DIR}/output/"luci-app-starlink-panel*.ipk 2>/dev/null && \
  echo "Success!" || echo "No output — check errors above"
echo "================================================"
echo ""
echo "Install on router:"
echo "  scp -O output/luci-app-starlink-panel-*.ipk root@192.168.1.1:/tmp/"
echo "  ssh root@192.168.1.1 'opkg install /tmp/luci-app-starlink-panel-*.ipk'"
