return {
    "nvim-treesitter/nvim-treesitter",
    build = ":TSUpdate",
    config = function () 
      local configs = require("nvim-treesitter.configs")

      configs.setup({
          -- Neovim 0.12 ships a Lua parser. Keeping the older plugin parser
          -- ahead of it causes its bundled Lua highlight query to fail.
          ensure_installed = { "c", "vim", "vimdoc", "query", "javascript", "typescript", "python", "go", "html" },
          sync_install = false,
          highlight = { enable = true },
          indent = { enable = true },  
        })
    end
 } 
