vim.api.nvim_create_user_command('GitBrowser', function()
  Snacks.gitbrowse()
end, { desc = 'Open the current file in Google Chrome' })
