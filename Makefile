include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-starlink-panel
PKG_VERSION:=1.0.0
PKG_RELEASE:=22

PKG_MAINTAINER:=bigmalloy
PKG_LICENSE:=MIT

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-starlink-panel
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Starlink Status Dashboard
  URL:=https://github.com/bigmalloy/starlink-panel
  DEPENDS:=+rpcd
  PKGARCH:=all
endef

define Package/luci-app-starlink-panel/description
  Starlink dish telemetry dashboard for GL.iNet 4.x firmware.
  Adds a Starlink panel to the GL.iNet web interface and LuCI Advanced mode.
  Uses starlink-dish (installed automatically) for dish gRPC communication.
endef

define Build/Compile
endef

define Package/luci-app-starlink-panel/install
	# ── rpcd backend ─────────────────────────────────────────────────────────
	# Installed as 'starlink' for GL.iNet OUI ($rpcRequest service name)
	# and as 'luci.starlink-panel' for LuCI Advanced mode.
	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./files/luci.starlink-panel \
		$(1)/usr/libexec/rpcd/starlink
	$(INSTALL_BIN) ./files/luci.starlink-panel \
		$(1)/usr/libexec/rpcd/luci.starlink-panel

	# ── rpcd ACL ─────────────────────────────────────────────────────────────
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./files/starlink-acl.json \
		$(1)/usr/share/rpcd/acl.d/starlink.json
	$(INSTALL_DATA) ./files/luci-app-starlink-panel-acl.json \
		$(1)/usr/share/rpcd/acl.d/luci-app-starlink-panel.json

	# ── GL.iNet OUI interface ─────────────────────────────────────────────────
	# Lua RPC backend loaded by nginx oui-rpc.lua (object name = 'starlink')
	$(INSTALL_DIR) $(1)/usr/lib/oui-httpd/rpc
	$(INSTALL_DATA) ./files/oui-rpc-starlink.lua \
		$(1)/usr/lib/oui-httpd/rpc/starlink
	# Vue.js view component — gzipped into /www/views/ (GL.iNet OUI convention)
	$(INSTALL_DIR) $(1)/www/views
	gzip -c ./files/gl-sdk4-ui-starlink.common.js \
		> $(1)/www/views/gl-sdk4-ui-starlink.common.js.gz
	chmod 644 $(1)/www/views/gl-sdk4-ui-starlink.common.js.gz
	# GL.iNet OUI menu entry (adds Starlink under Network tab)
	$(INSTALL_DIR) $(1)/usr/share/oui/menu.d
	$(INSTALL_DATA) ./files/starlink-oui-menu.json \
		$(1)/usr/share/oui/menu.d/starlink.json

	# ── LuCI Advanced mode ───────────────────────────────────────────────────
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./files/luci-app-starlink-panel-menu.json \
		$(1)/usr/share/luci/menu.d/luci-app-starlink-panel.json
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/starlink-panel
	$(INSTALL_DATA) ./files/status.js \
		$(1)/www/luci-static/resources/view/starlink-panel/status.js

	# ── starlink-dish installer ───────────────────────────────────────────────
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./files/install-grpcurl.sh \
		$(1)/usr/bin/install-grpcurl
endef

define Package/luci-app-starlink-panel/preinst
#!/bin/sh
mkdir -p /www/luci-static/resources/view/starlink-panel
exit 0
endef

define Package/luci-app-starlink-panel/postinst
#!/bin/sh
[ -f /etc/init.d/rpcd ] && /etc/init.d/rpcd restart
rm -rf /tmp/luci-modulecache /tmp/luci-indexcache
setsid sh -c '/usr/bin/install-grpcurl >/dev/null 2>&1' </dev/null >/dev/null 2>&1 &
exit 0
endef

define Package/luci-app-starlink-panel/prerm
#!/bin/sh
exit 0
endef

$(eval $(call BuildPackage,luci-app-starlink-panel))
