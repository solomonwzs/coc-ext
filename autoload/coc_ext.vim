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
