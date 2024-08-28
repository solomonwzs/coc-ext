OUTPUT_DIR = "$${HOME}/dotfiles/vim/coc-extensions"

all: common erl crypto

common:
	@echo -e "\033[0;33m>>>\033[0m build $(@)"
	@npm run build_ext
	@cp "./lib/coc-ext-common.js" "$(OUTPUT_DIR)"
	@cp "./conf/coc-ext-common.json" "$(OUTPUT_DIR)"
	@cp "./lua/coc-ext.lua" "$(OUTPUT_DIR)/../lua"
	@cp -r "./python/coc_ext.py" "$(OUTPUT_DIR)/../pythonx"
	@cp -r "./python/CocExt" "$(OUTPUT_DIR)/../pythonx"
	@cp "./syntax/hlpreview.vim" "$(OUTPUT_DIR)/../syntax"
	@cp "./conf/coc-ext.vim" "$(OUTPUT_DIR)/../conf"
	
	@mkdir -p "$(OUTPUT_DIR)/node_modules"
	@cp -r "./node_modules/tiktoken" "$(OUTPUT_DIR)/node_modules/tiktoken"

erl:
	@echo -e "\033[0;33m>>>\033[0m build $(@)"
	@npm run build_erl
	@cp "./lib/coc-ext-erlang.js" "$(OUTPUT_DIR)"
	@cp "./conf/coc-ext-erlang.json" "$(OUTPUT_DIR)"

crypto:
	@echo -e "\033[0;33m>>>\033[0m build $(@)"
	@npm run build_crypto
	@cp "./lib/coc-ext-crypto.js" "$(OUTPUT_DIR)"
	@cp "./conf/coc-ext-crypto.json" "$(OUTPUT_DIR)"

test:
	@echo -e "\033[0;33m>>>\033[0m build $(@)"
	@npm run build_test
	@node ./lib/test.js
