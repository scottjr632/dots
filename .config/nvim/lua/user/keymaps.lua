vim.keymap.set('n', '<leader>-', '<CMD>Oil<CR>')
vim.keymap.set('n', 'U', '<C-r>', { noremap = true, silent = true, desc = 'Redo' })

-- Telesceope
local function telescope_live_grep_open_files()
  require('telescope.builtin').live_grep {
    grep_open_files = true,
    prompt_title = 'Live Grep in Open Files',
  }
end

vim.keymap.set('n', '<leader>s/', telescope_live_grep_open_files, { desc = '[S]earch [/] in Open Files' })
vim.keymap.set('n', '<leader>ss', require('telescope.builtin').builtin, { desc = '[S]earch [S]elect Telescope' })
vim.keymap.set('n', '<leader>fg', require('telescope.builtin').git_files, { desc = 'Search [G]it [F]iles' })
vim.keymap.set('n', '<leader>sf', require('telescope.builtin').find_files, { desc = '[S]earch [F]iles' })
vim.keymap.set('n', '<leader>sh', require('telescope.builtin').help_tags, { desc = '[S]earch [H]elp' })
vim.keymap.set('n', '<leader>sw', require('telescope.builtin').grep_string, { desc = '[S]earch current [W]ord' })
vim.keymap.set('n', '<leader>sG', require('telescope.builtin').live_grep, { desc = '[S]earch by [G]rep' })
vim.keymap.set('n', '<leader>sg', ':LiveGrepGitRoot<cr>', { desc = '[S]earch by [G]rep on Git Root' })
vim.keymap.set('n', '<leader>sd', require('telescope.builtin').diagnostics, { desc = '[S]earch [D]iagnostics' })
vim.keymap.set('n', '<leader>sr', require('telescope.builtin').resume, { desc = '[S]earch [R]esume' })
vim.keymap.set('n', '<leader>fo', require('telescope.builtin').oldfiles, { desc = '[F]ind [O]ld files' })
vim.keymap.set('n', '<leader>fr', require('telescope').extensions.recent_files.pick, { desc = '[F]ind [R]ecents' })
vim.keymap.set('n', '<leader>fb', require('telescope.builtin').buffers, { desc = '[F]ind [B]uffers' })
vim.keymap.set('n', '<leader>fm', require('telescope.builtin').marks, { desc = '[F]ind [M]arks' })
vim.keymap.set('n', '<leader>fj', require('telescope.builtin').jumplist, { desc = '[F]ind [J]umplist' })

-- keymaps for diagnostics
vim.keymap.set('n', '[d', vim.diagnostic.goto_prev, { desc = 'Go to previous diagnostic message' })
vim.keymap.set('n', ']d', vim.diagnostic.goto_next, { desc = 'Go to next diagnostic message' })
vim.keymap.set('n', '<leader>d', vim.diagnostic.open_float, { desc = 'Open floating diagnostic message' })
vim.keymap.set('n', '<leader>q', vim.diagnostic.setloclist, { desc = 'Open diagnostic list' })

-- Keymaps for better default experience
-- See `:help vim.keymap.set()`
vim.keymap.set({ 'n', 'v' }, '<Space>', '<Nop>', { silent = true })

-- Redo
vim.keymap.set('n', 'U', '<C-r>', { noremap = true, silent = true, desc = 'Redo' })

-- Easy replace text undo the current word
vim.keymap.set('n', 'S', function()
  local cmd = ":%s/<C-r><C-w>/<C-r><C-w>/gI<Left><Left><Left>"
  local keys = vim.api.nvim_replace_termcodes(cmd, true, false, true)
  vim.api.nvim_feedkeys(keys, "n", false)
end)

-- Remap the open previous buffer
vim.api.nvim_set_keymap("n", "<C-p>", "<C-^>", { noremap = true })

-- Undotree
vim.api.nvim_set_keymap('n', '<leader>uu', '<CMD>UndotreeToggle<CR>', { desc = '[U]ndo tree toggle' })

-- Make changing widths of vertical split easier
vim.api.nvim_set_keymap('n', '+', '<CMD>vertical resize +5<CR>', { desc = 'Increase width' })
vim.api.nvim_set_keymap('n', '_', '<CMD>vertical resize -5<CR>', { desc = 'Decrease width' })

-- easier visual select entire line
vim.api.nvim_set_keymap('n', 'vv', 'V', {})

-- Move lines
vim.api.nvim_set_keymap('n', 'J', ":m '>+1<CR>gv=gc", {})
vim.api.nvim_set_keymap('n', 'K', ":m '<-2<CR>gv=gc", {})
