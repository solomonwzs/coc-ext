if exists("b:current_syntax")
  finish
endif
let b:current_syntax = "hlpreview"

syntax match HlPreview /^>.*/
