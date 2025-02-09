
-- Oil keymaps
vim.keymap.set('n', '<leader>-', '<CMD>Oil<CR>')

-- clear search highlighting on escape
vim.keymap.set('n', '<ESC><ESC>', '<CMD>nohlsearch<CR>')

-- Undotree
vim.keymap.set('n', '<leader>uu', '<CMD>UndotreeToggle<CR>')

-- Remap the open previous buffer
vim.api.nvim_set_keymap("n", "<C-p>", "<C-^>", { noremap = true })

-- Git
vim.keymap.set('n', '<leader>gg', '<CMD>G<CR>', { desc = '[G]it' })

-- Make changing widths of vertical split easier
vim.api.nvim_set_keymap('n', '+', '<CMD>vertical resize +5<CR>', { desc = 'Increase width' })
vim.api.nvim_set_keymap('n', '_', '<CMD>vertical resize -5<CR>', { desc = 'Decrease width' })

-- yank bank
vim.keymap.set("n", "<leader>y", "<cmd>YankBank<CR>", { noremap = true })
