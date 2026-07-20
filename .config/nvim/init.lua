-- Neovim 0.12 includes a Lua parser that matches its bundled Lua highlight
-- queries. Load it before plugins can register an older parser copy.
local lua_parsers = vim.api.nvim_get_runtime_file('parser/lua.so', true)
if #lua_parsers > 0 then
  vim.treesitter.language.add('lua', { path = lua_parsers[#lua_parsers] })
end

require('config.lazy')
require('config.lsp')

require('user')
