-- Keymaps for better default experience
-- See `:help vim.keymap.set()`
vim.keymap.set({ 'n', 'v' }, '<Space>', '<Nop>', { silent = true })

-- Remap for dealing with word wrap
vim.keymap.set('n', 'k', "v:count == 0 ? 'gk' : 'k'", { expr = true, silent = true })
vim.keymap.set('n', 'j', "v:count == 0 ? 'gj' : 'j'", { expr = true, silent = true })

-- Diagnostic keymaps
vim.keymap.set('n', '[d', vim.diagnostic.goto_prev, { desc = 'Go to previous diagnostic message' })
vim.keymap.set('n', ']d', vim.diagnostic.goto_next, { desc = 'Go to next diagnostic message' })
vim.keymap.set('n', '<leader>d', vim.diagnostic.open_float, { desc = 'Open floating diagnostic message' })
vim.keymap.set('n', '<leader>q', vim.diagnostic.setloclist, { desc = 'Open diagnostics list' })


-- Redo
vim.keymap.set('n', 'U', '<C-r>', { noremap = true, silent = true, desc = 'Redo' })

-- Rotate windows
vim.keymap.set('n', '<leader>rw', ':RotateWindows<CR>', { noremap = true, silent = true, desc = '[R]otate [W]indows' })

-- Spell checking
vim.keymap.set('n', '<leader>ss', function()
  require('telescope.builtin').spell_suggest(require('telescope.themes').get_dropdown({
    previewer = false,
  }))
end, { desc = '[S]earch [S]pell suggestions' })

-- Easy replace text undo the current word
vim.keymap.set('n', 'S', function()
  local cmd = ":%s/<C-r><C-w>/<C-r><C-w>/gI<Left><Left><Left>"
  local keys = vim.api.nvim_replace_termcodes(cmd, true, false, true)
  vim.api.nvim_feedkeys(keys, "n", false)
end)

-- dont' lose the contents of the resgister when pasting
vim.keymap.set('n', '<leader>p', '"_dp')

vim.api.nvim_set_keymap('n', '<leader>ee', [[<Esc>iif err != nil {
  return err
}
<esc>]], { noremap = true, silent = true })

-- Harpoon setup

require("telescope").load_extension('harpoon')

vim.keymap.set('n', '<leader>ha', require('harpoon.mark').add_file, { desc = 'Add file to harpoon' })
vim.keymap.set('n', '<leader>ho', require('harpoon.ui').toggle_quick_menu, { desc = 'Open harpoon quick menu' })

vim.keymap.set('n', '<leader>hn', require('harpoon.ui').nav_next, { desc = 'Go to next file in harpoon' })
vim.keymap.set('n', '<leader>hp', require('harpoon.ui').nav_prev, { desc = 'Go to previous file in harpoon' })
vim.keymap.set('n', '<leader>h1', function()
  require('harpoon.ui').nav_file(1)
end, { desc = 'Run npm run dev in terminal 1' })

vim.keymap.set('n', '<leader>h2', function()
  require('harpoon.ui').nav_file(2)
end, { desc = 'Run npm run dev in terminal 2' })

vim.keymap.set('n', '<leader>h3', function()
  require('harpoon.ui').nav_file(3)
end, { desc = 'Run npm run dev in terminal 2' })

vim.keymap.set('n', '<leader>h4', function()
  require('harpoon.ui').nav_file(4)
end, { desc = 'Run npm run dev in terminal 4' })

vim.keymap.set('n', '<leader>hr', function()
  require('harpoon.mark').rm_file()
end, { desc = 'Remove current files' })

vim.keymap.set('n', '<leader>hc', function()
  require('harpoon.mark').clear_all()
end, { desc = 'Clear all files in harpoon' })

-- Oil setup
vim.keymap.set('n', '<leader>to', function()
  require('oil').toggle_float()
end, { desc = 'Toggle [O]il' })

vim.keymap.set('n', '<leader>o', '<CMD>Oil<CR>', { desc = '[T]oggle [O]il' })

-- Open link under cursor
vim.keymap.set('n', '<leader>gx', function()
  vim.cmd.URLOpenUnderCursor()
end, { desc = 'Open link under cursor' })

vim.keymap.set('n', 'L', '$', { noremap = true, silent = true, desc = 'Move to end of line' })
vim.keymap.set('n', 'H', '^', { noremap = true, silent = true, desc = 'Move to end of line' })


-- Keep center while scrolling
vim.keymap.set('n', 'G', 'Gzz')
vim.keymap.set('n', 'gg', 'ggzz')


-- toggle term
vim.keymap.set('n', '<leader>tt', function()
  require('toggleterm').toggle(1, 30)
end, { desc = 'Toggle terminal' })


-- Aerial - symbols outline
vim.keymap.set('n', '<leader>so', function()
  require('aerial').toggle()
end, { desc = 'Toggle [S]ymbols [O]utline' })


-- Remap the open previous buffer
vim.api.nvim_set_keymap("n", "<C-p>", "<C-^>", { noremap = true })


-- Undotree
vim.keymap.set('n', '<leader>tu', vim.cmd.UndotreeToggle, { desc = '[T]oggle [U]ndotree' })


-- Gitblame
vim.keymap.set('n', '<leader>gb', vim.cmd.GitBlameToggle, { desc = '[G]it [B]lame' })
