" @author     Solomon Ng <solomon.wzs@gmail.com>
" @version    1.0
" @date       2025-02-20
" @license    GPL-2.0+

function! coc_ext#debugPromt()
  echo '[Y]es/[N]o'
  let choice = input('> ')

  redraw

  if choice =~? '^y\(es\)\?$'
    return 1
  elseif choice =~? '^n\(o\)\?$'
    return 0
  else
    echo 'Invalid choice. Please enter Yes or No.'
    return coc_ext#debugPromt()
  endif
endfunction

function! coc_ext#newScratchWindow(ver)
  let ori_winnr = winnr()
  let ori_winid = win_getid()

  if a:ver == 0
    let height = winheight(ori_winnr)
    let new_height = (height - 1) / 2
    if new_height < 1
      " echoerr 'height not enough'
      return {'ori_winnr': ori_winnr}
    endif
    execute new_height."new"
  else
    let width = winwidth(ori_winnr)
    let new_width = width / 2
    if new_width < 1
      return {'ori_winnr': ori_winnr}
    endif
    execute new_width."vnew"
  endif

  let new_winnr = winnr()
  let new_winid = win_getid()
  let new_bufnr = bufnr()
  setlocal buftype=nofile
  setlocal bufhidden=wipe
  setlocal noswapfile
  setlocal nobuflisted

  return {
      \ 'ori_winnr': ori_winnr,
      \ 'ori_winid': ori_winid,
      \ 'new_winnr': new_winnr,
      \ 'new_winid': new_winid,
      \ 'new_bufnr': new_bufnr
      \ }
endfunction
