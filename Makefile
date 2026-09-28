OUTPUT_DIR = "$${HOME}/dotfiles/vim/coc-extensions"

all: common erl crypto

# 类型检查：esbuild 不做类型检查，用 tsc --noEmit 捕获类型/抽象方法实现错误。
# 每次只检查当前构建目标的入口文件及其依赖图，避免其它目标（如 crypto）的错误干扰本目标。
# 用法：make typecheck TSC_PROJECT=tsconfig.common.json
TSC_PROJECT ?= tsconfig.common.json
typecheck:
	@echo -e "\033[0;33m>>>\033[0m typecheck $(TSC_PROJECT)"
	@npx tsc -p $(TSC_PROJECT)

common: | typecheck
	@echo -e "\033[0;33m>>>\033[0m build $(@)"
	@npm run build_ext
	@cp "./dist/coc-ext-common.js" "$(OUTPUT_DIR)"
	@cp "./conf/coc-ext-common.json" "$(OUTPUT_DIR)"
	@cp "./lua/coc-ext.lua" "$(OUTPUT_DIR)/../lua"
	@cp -r "./python/coc_ext.py" "$(OUTPUT_DIR)/../pythonx"
	@cp -r "./python/CocExt" "$(OUTPUT_DIR)/../pythonx"
	@cp "./syntax/hlpreview.vim" "$(OUTPUT_DIR)/../syntax"
	@cp "./conf/coc-ext.vim" "$(OUTPUT_DIR)/../conf"
	@cp "./autoload/coc_ext.vim" "$(OUTPUT_DIR)/../autoload"

erl: TSC_PROJECT=tsconfig.erl.json
erl: | typecheck
	@echo -e "\033[0;33m>>>\033[0m build $(@)"
	@npm run build_erl
	@cp "./dist/coc-ext-erlang.js" "$(OUTPUT_DIR)"
	@cp "./conf/coc-ext-erlang.json" "$(OUTPUT_DIR)"

crypto: TSC_PROJECT=tsconfig.crypto.json
crypto: | typecheck
	@echo -e "\033[0;33m>>>\033[0m build $(@)"
	@npm run build_crypto
	@cp "./dist/coc-ext-crypto.js" "$(OUTPUT_DIR)"
	@cp "./conf/coc-ext-crypto.json" "$(OUTPUT_DIR)"

test:
	@echo -e "\033[0;33m>>>\033[0m build $(@)"
	@npm run build_test
	@node ./dist/test.js

cpy_modules:
	@mkdir -p "$(OUTPUT_DIR)/node_modules"
	@cp -r "./node_modules/tiktoken" "$(OUTPUT_DIR)/node_modules/tiktoken"
