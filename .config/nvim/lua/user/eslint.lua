vim.api.nvim_create_user_command('EslintFix', function()
  local supported_filetypes = { 'javascript', 'javascriptreact', 'typescript', 'typescriptreact' }
  local current_filetype = vim.bo.filetype
  if not vim.tbl_contains(supported_filetypes, current_filetype) then
    return
  end
  vim.cmd('silent !./node_modules/.bin/eslint --fix %')
end, {})
