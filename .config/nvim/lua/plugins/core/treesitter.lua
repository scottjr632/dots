return {
  "nvim-treesitter/nvim-treesitter",
  lazy = false,
  build = ":TSUpdate",
  config = function()
    local filetypes = {
      "c",
      "go",
      "html",
      "javascript",
      "lua",
      "python",
      "query",
      "typescript",
      "vim",
      "vimdoc",
    }

    -- The current nvim-treesitter API delegates highlighting to Neovim.
    vim.api.nvim_create_autocmd("FileType", {
      pattern = filetypes,
      callback = function()
        vim.treesitter.start()
        vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
      end,
    })
  end,
}
