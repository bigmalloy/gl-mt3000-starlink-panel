-- /usr/lib/oui-httpd/rpc/starlink
-- GL.iNet OUI RPC backend for Starlink dish telemetry.
-- Called by nginx oui-rpc.lua for $rpcRequest('call', ['sid', 'starlink', ...])

local cjson = require "cjson"

local DISH_IP   = "192.168.100.1"
local DISH_PORT = "9200"

local M = {}

function M.dish(args)
    local cmd = string.format(
        "starlink-dish dish -d 'http://%s:%s' 2>&1",
        DISH_IP, DISH_PORT
    )
    local handle = io.popen(cmd)
    local output = handle:read("*a")
    handle:close()

    local ok, data = pcall(cjson.decode, output)
    if not ok then
        return { available = false, error = output }
    end
    return data
end

function M.reboot_dish(args)
    local cmd = string.format(
        "starlink-dish reboot -d 'http://%s:%s' 2>&1",
        DISH_IP, DISH_PORT
    )
    local handle = io.popen(cmd)
    local output = handle:read("*a")
    handle:close()

    local ok, data = pcall(cjson.decode, output)
    if not ok then
        return { success = false, error = output }
    end
    return data
end

return M
