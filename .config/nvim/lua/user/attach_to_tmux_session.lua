local popup = require("plenary.popup")

local Win_id = nil
local CurrWin_id = nil

function AttachToTmuxSessionCloseMenu()
  if Win_id ~= nil then
    vim.api.nvim_win_close(Win_id, true)
    Win_id = nil
  end
end

function AttachToTmuxSession(opts, cb)
  local height = 20
  local width = 30
  local borderchars = { "─", "│", "─", "│", "╭", "╮", "╯", "╰" }
  CurrWin_id = vim.api.nvim_get_current_win()

  Win_id = popup.create(opts, {
    title = "Tmux Sessions",
    highlight = "MyProjectWindow",
    line = math.floor(((vim.o.lines - height) / 2) - 1),
    col = math.floor((vim.o.columns - width) / 2),
    minwidth = width,
    minheight = height,
    borderchars = borderchars,
    callback = cb,
  })
  local bufnr = vim.api.nvim_win_get_buf(Win_id)
  vim.api.nvim_buf_set_keymap(bufnr, "n", "q", "<cmd>lua AttachToTmuxSessionCloseMenu()<CR>", { silent = false })
end

vim.api.nvim_create_user_command('AttachToTmuxSession', function()
  local output = vim.fn.systemlist("tmux ls | awk -F: '{print $1}'")
  local harpoon = require('harpoon.term')

  local opts = {}
  for _, v in pairs(output) do
    opts[#opts + 1] = v
  end
  local cb = function(_, sel)
    if CurrWin_id ~= nil then
      vim.api.nvim_set_current_win(CurrWin_id)
    end
    harpoon.gotoTerminal(0)
    harpoon.sendCommand(0, '\x02d' .. '\n')
    os.execute("sleep " .. tonumber(0.2))
    harpoon.sendCommand(0, 'tmux a -t ' .. sel .. '\n')
    harpoon.gotoTerminal(0)
  end
  AttachToTmuxSession(opts, cb)
end, {})
