vim.api.nvim_create_autocmd("BufWritePre", {
  group = vim.api.nvim_create_augroup("format_on_save", { clear = true }),
  pattern = "*",
  desc = "Run LSP formatting on a file on save",
  callback = function()
    vim.api.nvim_buf_get_name(0)
    if vim.fn.exists(":Format") > 0 then
      vim.cmd.Format()
    end
  end,
})

vim.api.nvim_create_autocmd("BufWritePre", {
  group = vim.api.nvim_create_augroup("format_on_save", { clear = true }),
  pattern = { "*.ts", "*.tsx", "*.js", "*.jsx" },
  desc = "Run LSP formatting on a file on save",
  callback = function()
    vim.cmd(vim.cmd.EslintFixAll())
  end,
})
