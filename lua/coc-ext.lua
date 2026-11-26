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
vim.treesitter.language.register("markdown", "aichat")

local group = vim.api.nvim_create_augroup("coc_ext_aichat", {clear = true})
vim.api.nvim_create_autocmd("FileType", {
  group = group,
  pattern = "aichat",
  callback = function(ev)
    -- 复用 nvim 自带 ftplugin：treesitter start + comments/formatoptions + ]]/[[/gO
    pcall(vim.cmd, "runtime! ftplugin/markdown.vim ftplugin/markdown.lua " ..
              "ftplugin/markdown_*.vim ftplugin/markdown_*.lua " ..
              "ftplugin/markdown/*.vim ftplugin/markdown/*.lua")
    if not vim.treesitter.highlighter.active[ev.buf] then
      -- vim.treesitter.start(ev.buf, "markdown") 
      pcall(vim.treesitter.start, ev.buf, "markdown")
    end
    if not vim.treesitter.highlighter.active[ev.buf] then
      vim.bo[ev.buf].syntax = "markdown"
    end
  end
})

local has, render = pcall(require, "render-markdown")
if has then
  render.setup({file_types = {"markdown", "aichat"}})
end
