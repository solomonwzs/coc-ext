if exists("b:current_syntax")
  finish
endif
let b:current_syntax = "kimichat"

" syntax region KcInput start=/^<<<</ end=/^>>>>/
syntax match KcInput /^>>.*/

hi KcInput ctermfg=239 ctermbg=74 cterm=bold
