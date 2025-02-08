-- local M = {}
-- local CocAction = vim.fn.CocAction
-----quickpick
-----@param title string
-----@param items string[]
-----@param command_id string
-- function M.quickpick(title, items, command_id)
--  vim.ui.select(items, {prompt = title}, function(_, idx)
--    CocAction("runCommand", command_id, (idx and idx - 1) or -1)
--  end)
-- end
-- return M
local has, render = pcall(require, "render-markdown")
if has then
  render.setup({file_types = {"markdown", "aichat"}})
end

vim.treesitter.language.register("markdown", "aichat")
