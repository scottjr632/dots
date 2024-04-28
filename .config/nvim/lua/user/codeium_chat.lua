vim.api.nvim_create_user_command('CodeiumChat', function()
  vim.fn['codeium#Chat']()
end, {})
