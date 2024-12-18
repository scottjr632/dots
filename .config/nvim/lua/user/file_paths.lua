local M = {}

-- Function to get and print the current file's relative path
function M.print_current_path()
  -- Get the current buffer's file path
  local current_path = vim.fn.expand('%:p')

  -- Convert absolute path to relative path
  local pwd = vim.fn.getcwd()
  if pwd and current_path:sub(1, #pwd) == pwd then
    current_path = current_path:sub(#pwd + 2)
  end

  -- Print the relative path
  print("Current file path: " .. current_path)
  vim.notify("Current file path: " .. current_path)
end

-- Function to print just the filename of the current buffer
function M.print_filename()
  -- Get just the filename using vim.fn.expand with :t (tail) modifier
  local filename = vim.fn.expand('%:t')
  print("Current filename: " .. filename)
  vim.notify("Current filename: " .. filename)
end

-- Function to copy the current filename to clipboard
function M.copy_filename()
  local filename = vim.fn.expand('%:t')
  vim.fn.setreg('+', filename) -- Copy to system clipboard
  vim.notify("Copied filename: " .. filename)
end

-- Function to print the absolute path of current file
function M.print_absolute_path()
  local abs_path = vim.fn.expand('%:p')
  print("Absolute path: " .. abs_path)
  vim.notify("Absolute path: " .. abs_path)
end

-- Function to copy the absolute path to clipboard
function M.copy_absolute_path()
  local abs_path = vim.fn.expand('%:p')
  vim.fn.setreg('+', abs_path) -- Copy to system clipboard
  vim.notify("Copied absolute path: " .. abs_path)
end

-- Create user commands to call the functions
vim.api.nvim_create_user_command('PrintCurrentPath', M.print_current_path, {})
vim.api.nvim_create_user_command('PrintFileName', M.print_filename, {})
vim.api.nvim_create_user_command('PrintAbsolutePath', M.print_absolute_path, {})

vim.api.nvim_create_user_command('CopyFileName', M.copy_filename, {})
vim.api.nvim_create_user_command('CopyAbsolutePath', M.copy_absolute_path, {})

return M
