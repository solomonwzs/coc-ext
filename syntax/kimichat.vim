if exists("b:current_syntax")
  finish
endif
let b:current_syntax = "kimichat"

syntax match KcInput /^>>.*/
syntax match KcRef /\[\^[0-9]*\^\]/
syntax match KcSearch /\[[0-9]*\]/

hi KcInput ctermfg=239 ctermbg=74 cterm=bold
hi KcRef ctermfg=245
hi KcSearch ctermfg=245
