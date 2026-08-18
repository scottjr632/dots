require('config.lazy')
require('user')
require('lsp.utils')

vim.lsp.enable({
  "lua_ls",
  "ts_ls",
  "go_ls",
  "php_ls",
  "tailwind_ls",
  "eslint_ls",
  "rust_analyzer",
})
