# coc-ext

基于 coc.nvim 插件系统（LSP 客户端）的多功能 Neovim 扩展，使用 TypeScript 编写。提供 AI 对话、代码格式化、翻译、加密文件处理、Erlang 语言服务器集成及多种 Vim 实用工具。

## 技术栈

- **语言**: TypeScript（严格模式，目标 ESNext）
- **运行时**: Node.js（目标 node10.12+）
- **构建工具**: esbuild，通过 Makefile 和 npm scripts 编排
- **代码规范**: ESLint + Prettier
- **插件 API**: coc.nvim
- **主要依赖**: puppeteer-core, tiktoken, vscode-languageserver-protocol, vscode-uri

## 项目结构

```
src/
  ai/              # AI 对话集成（DeepSeek, Kimi, 百炼, ZAi）
  formatter/       # 代码格式化器（Prettier, clang-format, bazel, lua, shfmt, cmake）
  lists/           # CocList 实现（命令、键位映射、ripgrep、高亮、自动命令）
  leaderf/         # LeaderF 集成
  lightbulb/       # 代码操作灯泡提示
  translators/     # 翻译引擎（Google, Bing, CIBA）
  utils/           # 共享工具模块（配置、HTTP、编解码、文件、日志、类型等）
  test/            # 测试模块
  coc-ext-common.ts   # 入口：通用功能模块
  coc-ext-erlang.ts   # 入口：Erlang 语言服务器
  coc-ext-crypto.ts   # 入口：加密文件处理
  test.ts             # 入口：测试运行器
conf/              # 插件清单（JSON）和 Vim 配置
lib/               # 编译输出（esbuild 打包产物）
lua/               # Lua 辅助函数
python/            # Python 集成脚本
autoload/          # Vim autoload 函数
syntax/            # Vim 语法文件
esbuild_*.js       # 各模块的 esbuild 构建配置
```

## 功能模块

### AI 对话（`src/ai/`）
支持多个 LLM 后端（DeepSeek、Kimi v1/v2、百炼、ZAi）。功能包括：流式响应、对话历史（基于文件缓存）、Token 计数（tiktoken）、上下文管理、模型选择。

### 代码格式化（`src/formatter/`）
工厂模式分发器（`formatprovider.ts`）按语言路由到对应格式化器。支持：Prettier（JS/TS/JSON/MD）、clang-format（C/C++）、bazel-buildifier、lua-format、shfmt（Shell）、cmake-format。所有格式化器继承 `BaseFormatter`，通过外部进程执行。

### 翻译（`src/translators/`）
策略模式，支持 Google、Bing、CIBA 后端。具备自动语言检测、代理、降级回退、浮动窗口展示功能。

### 编解码（`src/utils/decoder.ts`）
支持 UTF-8、GBK、Base64、AES-256 加解密、MIME 解码。

### CocList（`src/lists/`）
自定义列表 UI：扩展演示、Vim 命令、键位映射、ripgrep 文件/词搜索、自动命令、高亮组、AI 对话。

### Erlang 语言服务器（`src/coc-ext-erlang.ts`）
通过 LSP 协议集成 Erlang 语言服务器，支持可配置的服务器路径。

### 加密模块（`src/coc-ext-crypto.ts`）
AES-256 文件加解密，支持文件模式过滤、文件监听、基于盐值的密码哈希。

## 构建与开发

```bash
npm install              # 安装依赖
make all                 # 构建所有模块（common, erlang, crypto）
make common              # 仅构建 common 模块
npm run watch_ext        # common 模块监听模式
npm run lint             # ESLint 检查
make test                # 构建并运行测试
```

每个模块有独立的 esbuild 配置（`esbuild_ext.js`、`esbuild_erl.js`、`esbuild_crypto.js`、`esbuild_test.js`）。输出到 `lib/` 目录。外部依赖 `coc.nvim` 和 `tiktoken` 不打包。

## 配置项

插件配置定义在 `conf/coc-ext-common.json`：
- `coc-ext.enabled`：启用/禁用扩展
- `coc-ext.log.detail` / `coc-ext.log.level`：日志设置
- `coc-ext.formatting`：各语言的格式化器设置数组
- `coc-ext.pythonDir`：Python 脚本路径
- `coc-ext.floatConfig`：浮动窗口配置
- `coc-ext.aichat`：AI 对话配置

## 设计模式

- **工厂模式**：`FormattingEditProvider` 按语言选择格式化器
- **策略模式**：多种翻译器/格式化器实现共享统一接口
- **Provider 模式**：LSP Provider 接口注册到 coc.nvim
- **基类抽象**：`BaseFormatter`、`BaseTranslator`、`BaseChatChannel` 提供共享逻辑
- **文件缓存**：`FileCache` 类用于对话历史持久化

## 入口点

所有模块导出 `activate(context: ExtensionContext)` 函数供 coc.nvim 调用：
- `src/coc-ext-common.ts` -> `lib/coc-ext-common.js`
- `src/coc-ext-erlang.ts` -> `lib/coc-ext-erlang.js`
- `src/coc-ext-crypto.ts` -> `lib/coc-ext-crypto.js`
