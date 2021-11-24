OUTPUT_DIR = "$${HOME}/dotfiles/vim/coc-extensions/"

all: common erl crypto

common:
	@echo -e "\033[0;33m>>>\033[0m build $(@)"
	@yarn build_ext
	@cp "./lib/coc-ext-common.js" "$(OUTPUT_DIR)"
	@cp "./conf/coc-ext-common.json" "$(OUTPUT_DIR)"

erl:
	@echo -e "\033[0;33m>>>\033[0m build $(@)"
	@yarn build_erl
	@cp "./lib/coc-ext-erlang.js" "$(OUTPUT_DIR)"
	@cp "./conf/coc-ext-erlang.json" "$(OUTPUT_DIR)"

crypto:
	@echo -e "\033[0;33m>>>\033[0m build $(@)"
	@yarn build_crypto
	@cp "./lib/coc-ext-crypto.js" "$(OUTPUT_DIR)"
	@cp "./conf/coc-ext-crypto.json" "$(OUTPUT_DIR)"

test:
	@echo -e "\033[0;33m>>>\033[0m build $(@)"
	@yarn build_test
	@node ./lib/test.js
