if exists("b:current_syntax")
  finish
endif
let b:current_syntax = "markdown"

" syntax match KcInput /^>>.*/
" syntax match KcRef /\[\^[0-9]*\^\]/
" syntax match KcSearch /\[[0-9]*\]/

" hi KcInput ctermfg=239 ctermbg=74 cterm=bold guifg=#4e4e4e guibg=#5fafd7 gui=bold
" hi KcRef ctermfg=245 guifg=#8a8a8a
" hi KcSearch ctermfg=245 guifg=#8a8a8a
