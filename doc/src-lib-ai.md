# `src/lib/ai` 源码阅读文档

> 通过逆向 Web 端私有接口、在终端 / 编辑器里对接 DeepSeek 与 Kimi 网页版聊天的客户端库。

## 目录

- [整体架构](#整体架构)
- [base.ts —— 公共抽象层](#basetts--公共抽象层)
- [deepseek.ts —— DeepSeek 客户端](#deepseekts--deepseek-客户端)
- [kimi.ts —— Kimi 客户端](#kimits--kimi-客户端)
- [两个实现的关键差异对比](#两个实现的关键差异对比)
- [依赖的 comm 模块](#依赖的-comm-模块)
- [已知问题与注意事项](#已知问题与注意事项)

## 整体架构

```
./src/lib/ai/
├── base.ts       —— 公共抽象层(接口定义 + 基类)
├── deepseek.ts   —— DeepSeek 网页版逆向客户端
├── kimi.ts       —— Kimi (www.kimi.com) 网页版逆向客户端
└── mimo.ts       —— Xiaomi MiMo Studio (aistudio.xiaomimimo.com) 逆向客户端
```

详细逆向分析见 [aistudio-xiaomimimo-reverse.md](./aistudio-xiaomimimo-reverse.md)。

三者均依赖 `../comm` 下的工具模块：

| 模块 | 作用 |
|---|---|
| `comm/http.ts` | 手写 HTTP(S) 客户端，支持 HTTP(S) 代理、流式回调、文件下载 |
| `comm/file.ts` | Promise 化的 fs 操作 |
| `comm/common.ts` | `ExtError` 错误码（`ERR_KIMI` / `ERR_DEEPSEEK` / `ERR_AUTH` 等）、代理环境变量解析 |
| `comm/logger.ts` | `BaseLogger` 日志基类 |

---

## base.ts —— 公共抽象层

### 数据接口

- `ChatItem` —— 会话列表项：`{label, chatId, description}`
- `ChatRefOptions` / `ChatRefItem` —— 光标处引用信息（`refText` + `segmentId`），用于点击
  `[citation:3]`、`[^3^]`、`[search result (N)]` 这类标记时弹出引用内容。

### `FileCache` —— 极简文件缓存

- 缓存目录：`~/.cache/chat_<chatName>/`（由 `BaseChat` 构造时创建）。
- 懒建目录（`checkDir`，成功一次后置 `ready`）。
- `set(key, data)` / `get(key)` 直接以 key 为文件名读写，无 TTL、无淘汰。

### `BaseChatChannel`（抽象类）—— UI 通道

由上层（coc.nvim 插件等）实现，统一界面：

| 方法 | 说明 |
|---|---|
| `show()` / `hide()` | 显示 / 隐藏聊天窗口 |
| `beforeChat()` / `afterChat()` | 一次聊天前后的钩子 |
| `append(text)` | 向聊天窗口追加文本（流式增量输出） |
| `appendLine(text)` | 追加一行 |
| `appendUserInput(datetime, text)` | 按统一格式显示用户输入 |
| `clear()` | 清空窗口 |
| `getCurrentRef(opts?)` | 取光标处的引用文本（返回 `ChatRefItem \| null`） |
| `openSearchWindow(lines)` | 打开搜索结果列表窗口 |
| `popup(content, title?, filetype?)` | 弹窗展示内容（通常 filetype=markdown） |

### `ChunkDecoder` —— SSE 文本流解析器

DeepSeek 流式响应用。逻辑：

1. 将收到的 chunk 拼到内部 `cache` Buffer 上；
2. 按 `\n` 切分，**半行数据留在缓存中**等下一个 chunk（处理粘包 / 半包）；
3. 每行按第一个 `:` 拆成 `{type, data}`，例如 `event: ready` → `{type:'event', data:'ready'}`，
   `data: {...}` → `{type:'data', data:'{...}'}`;
4. 无法解析的非空行交给 logger.debug。

### `BaseChat`（抽象类）—— 聊天后端基类

状态字段：

- `chatId` —— 当前会话 id（`setCurrentChatId` 时会 `chan.clear()`）。
- `cache: FileCache` —— 上述文件缓存。
- `chan: BaseChatChannel` —— UI 通道。

模板方法：

```ts
sendChat(text) = chan.beforeChat() → this.chat(text) → chan.afterChat()
```

抽象方法（由 DeepseekChat / KimiChat 实现）：

| 方法 | 说明 |
|---|---|
| `reset()` | 清空本地状态（currentMsgid 等） |
| `getChatName()` | 缓存目录名 / 显示名 |
| `getChatList()` | 列出会话 |
| `createChatId(name)` | 新建会话 |
| `showHistoryMessages()` | 回放历史消息到 channel |
| `showItem()` | 查看光标处引用 |
| `chat(text)` | 发送消息（流式） |
| `delSession(chatId)` | 删除会话 |

---

## deepseek.ts —— DeepSeek 客户端

目标主机 `chat.deepseek.com`。核心难点有三块。

### ① PoW（工作量证明）反爬破解

网页版发消息前必须先解一道 SHA3 哈希挑战：

1. `getPowChallenge(targetPath)` POST `/api/v0/chat/create_pow_challenge`，
   得到 `{algorithm, challenge, salt, signature, difficulty, expire_at, target_path}`。
2. `Sha3Wasm` 类**直接实例化官网的 wasm 模块**来求解：
   - wasm 来源：`https://chat.deepseek.com/static/sha3_wasm_bg.7b9ca65ddd.wasm`，
     下载后缓存在 FileCache 目录（`deepseek_sha3.wasm`）；
   - 手动操作 wasm 线性内存：
     - `encodeString(text)` → `__wbindgen_export_0`（alloc）分配内存并写入；
     - 调用导出的 `wasm_solve(retptr, ptrChallenge, lenChallenge, ptrPrefix, lenPrefix, difficulty)`，
       其中 prefix 为 `` `${salt}_${expire_at}_` ``，暴力碰撞出满足 difficulty 前导位的答案；
     - 从 `retptr` 读回 status（int32，小端）与 answer（float64，小端）。
3. 将 `{algorithm, challenge, salt, signature, target_path, answer}` 整体 JSON → base64，
   放入请求头 **`x-ds-pow-response`** 随 `/api/v0/chat/completion` 发出。

### ② JSON-Patch 风格的流式响应解析（`chat()` 的核心）

响应为 SSE 事件流，关键事件：

- `event: ready` + `data: {request_message_id, response_message_id}` ——
  打印 `>> id:xxx`，记录 `currentMsgid`（作为下一条消息的 `parent_message_id`）。
- `event: update_session` + `data: {p, o, v}` —— **补丁流**：
  - `p`：路径，如 `response/fragments/-1/content`、`response/search_status`；
  - `o`：操作，`SET`（替换）/ 追加（无 SET 时拼接）/ `BATCH`（批量子补丁）；
  - 后续帧可省略 `p`/`o`，**重复上一次的路径与操作**（外层用局部变量 `p`、`o` 记忆）；
  - 也可能到来全量快照 `{v: {response: {...}}}` 一次性重发整个响应对象。
- `event: close` —— 打印 `(END)`。

分发逻辑（`applyPatch` → `applyFragmentPatch`）：

- 路径正则 `^response/fragments/(-?\d+)/(content|thinking_content|status|results)$`
  定位到某个 fragment 的字段；索引 `-1` 表示最后一个（当前）fragment；
- **补丁先于快照到达时**，若 fragment 尚不存在，按字段名**合成**一个
  （content→RESPONSE，thinking_content→THINK，results/status→SEARCH）；
- `response/content`、`response/thinking_content` 等价于对 `-1` 号 fragment 打补丁；
- `o == 'BATCH'` 且 value 为数组时，逐个子补丁递归分发（支持对某个 fragment 的 BATCH，
  以便 SEARCH fragment 的 status 及时变为 FINISHED，让搜索标记打印在正文之前）；
- `response/thinking_elapsed_secs` 出现即关闭 thinking 块。

**增量渲染**（`emitFragments`）：

- 每次把全部 fragments 重新拼接出 `thinkingText` / `contentText`，
  与已发送长度（`emittedThinking` / `emittedContent`）比较，**只把新增后缀** `chan.append` 到屏幕；
- thinking 内容用 `---` 包裹（`inThinking` 状态控制开合）；
- SEARCH fragment 携带 `results` 时按 URL 去重合并进 `searchResults`；
  SEARCH 结束（status=FINISHED）或 `search_status=FINISHED` 时打印
  `` [search result (N)] `` 标记（`printSearchMarker`，只打一次，且会先关闭 thinking 块）；
- 未识别的路径 / 值统一 `logger.debug` 留痕。

请求体（`/api/v0/chat/completion`）：

```json
{
  "chat_session_id": "...",
  "parent_message_id": "...",
  "prompt": "...",
  "ref_file_ids": [],
  "search_enabled": true,
  "thinking_enabled": false
}
```

请求头还带 `x-client-locale: zh_CN`、`x-client-platform: web` 与伪装的浏览器 UA。

### ③ 其余常规操作

| 方法 | 接口 | 说明 |
|---|---|---|
| `getChatList` | GET `/api/v0/chat_session/fetch_page?count=100` | 按 id 去重，description 显示更新时间 |
| `createChatId` | POST `/api/v0/chat_session/create` | body `{character_id: null}` |
| `delSession` | POST `/api/v0/chat_session/delete` | body `{chat_session_id}` |
| `showHistoryMessages` | GET `/api/v0/chat/history_messages?chat_session_id=` | 回放历史（见下） |
| `showItem` | — | 光标引用查看（见下） |

**历史回放**：遍历 `chat_messages`，取最后一个消息 id 作为 `currentMsgid`。
USER 消息把所有 `REQUEST` fragment 的 content 合并显示；ASSISTANT 消息：

- 先收集所有 `SEARCH` fragment 的 results，缓存为 `{chatId}-{msgid}-search.json`，
  并打印 `` [search result (N)] `` 标记；
- 再按序渲染 `THINKING`（`---` 包裹）与 `RESPONSE` fragment 内容。

**showItem（光标引用）**：

- `[citation:N]` → 从 search.json 中找 `cite_index == N` 的条目，`popup` 弹窗（markdown）；
- `[search result (N)]` → 把整个 search.json 渲染成 markdown 列表，`openSearchWindow` 打开。

搜索结果条目渲染（`searchReault2Lines`）：`# idx - title` + `[site_name - 日期](url)` + snippet。

---

## kimi.ts —— Kimi 客户端

目标主机 `www.kimi.com`。默认参数：模型 `k3-agent`（agent 场景
`SCENARIO_OK_COMPUTER`，`kimiplus_id: ok-computer`）、thinking 开启、
`REASONING_EFFORT_HIGH`、`CONTEXT_LENGTH_L`。

### ① 认证：refresh token → access token

- 构造时只持有 `rtoken`（refresh token）；
- `getAccessToken()` GET `/api/auth/token/refresh`，用 `Bearer rtoken` 换取
  `access_token` 写回 headers；
- `postJsonRequest()` 统一封装：无 Authorization 先刷新；遇 **401 自动刷新并重试一次**；
- 每次请求生成 20 位随机字符串作为 `X-Traffic-Id`；
- 其余固定头：`x-msh-platform: web`、`x-language: zh-CN`、`r-timezone: Asia/Shanghai`、伪装 UA。

### ② Connect 协议的二进制流

Kimi 的聊天接口走 gRPC-Connect 风格（`/apiv2/kimi.gateway.chat.v1.ChatService/Chat`）：

- **请求编码** `encodeBuffer(o)`：`[0x00 标志字节][4 字节大端长度][JSON body]`；
- **响应解码** `StreamDecoder`：读 1 字节标志 + 4 字节大端长度 + 消息体，
  循环处理粘包 / 半包（不足一帧时留在缓存）；
- Content-Type：`application/connect+json`。

### ③ 事件流处理（`chat()` 内）

每帧 JSON 形如 `{op, mask, block?/message?/ref?/...}`，按 `op + mask` 组合分发：

| op / mask | 处理 |
|---|---|
| `set` + `chat.lastRequest`（含 chat.id） | 新会话占位符 `$new` 替换为真实 chatId |
| `set` + `message`（status=GENERATING） | 打印 `>> id:xxx`，记录 `currentMsgid` |
| `set` / `append` + `block.think.content` | thinking 增量输出（`---` 包裹） |
| `set` / `append` + `block.text.content` | 正文增量输出（先关闭 thinking 块；首次正文前打印搜索标记） |
| `append` + `block.search.webPages` | 累积搜索结果 webPages |
| `append` + `message.refs.searchChunks` | 引用块并入 webPages |
| `msg.ref` | 收集 `ref.search` 到 refs（`[^N^]` 脚注的出处） |
| `done` | 关闭 thinking 块，打印 `(END)` |
| `heartbeat` | 忽略 |

搜索标记：首次输出正文时若 `webPages.length > 0` 打印 `` [search result (N)] ``。
流结束后把 `webPages` / `refs` 分别缓存为 `{chatId}-{msgid}-search.json` / `-refs.json`。

请求体（`ChatRequest`）要点：`tools: [TOOL_TYPE_SEARCH, TOOL_TYPE_ASK_USER]`、
`message.parent_id = currentMsgid`、新会话时 `chatId: undefined`（服务端在流里回告真实 id）。

### ④ 会话与历史

| 方法 | 接口 | 说明 |
|---|---|---|
| `getChatList` | POST `/apiv2/kimi.chat.v1.ChatService/ListChats` | page_size 50 |
| `createChatId` | — | 直接返回占位符 `$new`（真实 id 由流中 `chat.lastRequest` 事件回填） |
| `delSession` | POST `/apiv2/kimi.chat.v1.ChatService/DeleteChat` | |
| `showHistoryMessages` | POST `.../ListMessages`（`chatScroll`） | page_size 1000，消息 reverse 后回放 |
| `showItem` | — | 光标引用查看（见下） |

**历史回放**：

- user 消息：渲染 `text` block 与 `file` block（显示 `[file: name](previewUrl)`）；
- assistant 消息：
  - `search` block → webPages 缓存 + `` [search result (N)] `` 标记；
  - `tool` block（web_search）→ 从 `tool.contents[].searchResult.base` 组 webPages，同样缓存 + 标记；
  - `think` block → `---` 包裹；
  - `text` block → 正文；
  - `exception` block → 打印 ` localizedMessage.message`；
  - `msg.refs.searchChunks` → 缓存为 `-refs.json`。

**showItem（光标引用）**：

- `[^N^]` → 从 `-refs.json` 中找 `id == N` 的 chunk，popup 弹窗（title / siteName / url / snippet）；
- `[search result (N)]` → 把 `-search.json` 渲染成 markdown 列表，`openSearchWindow` 打开。

---

## mimo.ts —— Xiaomi MiMo Studio 客户端

目标主机 `aistudio.xiaomimimo.com`,协议逆向文档见 `doc/aistudio-xiaomimimo-reverse.md`。默认模型
`mimo-v2.6-pro`,thinking 开启,webSearch 关闭。

### ① 认证:三个浏览器 cookie

无 token 刷新机制,凭据为登录后导出的三个 cookie:

- `xiaomichatbot_serviceToken`(HttpOnly)
- `userId`
- `xiaomichatbot_ph`(校验值)

**每个 open-apis POST 请求必须把 `xiaomichatbot_ph` cookie 值复制为同名查询参数**(`withPh()`);
每次请求生成 W3C `traceparent` 头;401 响应携带 `loginUrl`(小米账号 SSO),映射为 `ERR_AUTH`。

### ② 会话管理

- `createChatId`:**本地生成 32hex** 作为 conversationId,再 POST `conversation/save` 注册;
- `delSession`:POST `conversation/delete`,body 为 conversationId 数组(逆向自前端 batchDelete);
- 首条消息完成后自动调 `genTitle`(把 query + 思维链 + 回答拼接发给服务端起标题)。

### ③ SSE 流式聊天(react/chat)

请求体:`{msgId(32hex), conversationId, query, isEditedQuery, previousDialogueId?,
modelConfig:{enableThinking, webSearchStatus, model}, multiMedias}`;其中 `previousDialogueId` 为
上一轮回复的 dialogId,用于多轮连续性。

流式响应复用 `ChunkDecoder`(SSE `id:`/`event:`/`data:` 行),事件分发:

| 事件 | 处理 |
|---|---|
| `dialogId` | 记录 currentMsgid,打印 `>> id:` |
| `message` | `data.reasoningContent` → thinking 块(`---` 包裹);`data.content` → 正文增量;`messageType` 可携带 `error`/`sensitive_query` 标记 |
| `usage` | logger.debug(含 nativeUsage/cached tokens 明细,发两次) |
| `finish` | `data:{"content":"[DONE]"}` → 打印 `(END)`,可携带 thinkingCostTime |
| `error` / `sensitive_query` | 错误行 / 敏感词拦截标记 |
| 其余(web_search/doc/tip_ratio/...) | logger.debug |

非 200 时收集响应体,结束后解析 `{code:401, loginUrl}` 展示重新登录链接。

### ④ 历史回放(react/dialog/list)

`{queryParam:{conversationId}, pageInfo}` → `data` 为对话框数组,按 `createTime` 升序渲染;
每个 `dialogLogDetailList[].result[]` 分 `reasoningContent`/`content` 两个元素,`dialogStatus`
非 success 时展示状态;`modelConfig` 是内嵌 JSON 字符串(未使用)。

---

## 两个实现的关键差异对比

| 维度 | DeepSeek | Kimi | MiMo |
|---|---|---|---|
| 认证 | 固定 Bearer token(authKey) | refresh token → access token,401 自动刷新重试 | 3 个 cookie(serviceToken/userId/ph),无刷新 |
| 反爬 | **PoW 挑战 + 本地 wasm 求解**，`x-ds-pow-response` 头 | 随机 `X-Traffic-Id` | `xiaomichatbot_ph` 查询参数(=cookie 值)+ `traceparent` |
| 流协议 | SSE 文本流(`event:` / `data:` 行),`ChunkDecoder` | 二进制长度前缀帧(Connect),`StreamDecoder` | SSE 文本流,复用 `ChunkDecoder` |
| 数据模型 | JSON-Patch 增量补丁 + 全量快照,按路径分发 | op/mask 事件消息,append 增量 | event 事件流,messageType/字段区分增量 |
| 增量渲染 | 全量拼接 fragments 后输出新增后缀(emitted 计数) | append 事件直接输出 | message 事件直接输出 |
| 引用标记 | `[citation:N]` | `[^N^]` | 无(webSearch disabled) |
| 新会话创建 | 先显式调 create 接口 | 占位符 `$new`,流中回填真实 id | **本地生成 32hex** + save 注册 |
| 搜索结果 | 按 URL 去重合并(mergeSearchResults) | webPages 直接累积 | 未启用 |
| thinking 开关 | 请求体 `thinking_enabled: false` | options `thinking: true` | `modelConfig.enableThinking: true`(服务端仍会下发思维链) |
| 多轮上下文 | `parent_message_id` | `message.parent_id` | `previousDialogueId`(可省略) |
| 标题生成 | 服务端自动 | 服务端自动 | 首条消息后客户端调 `genTitle` |
| thinking 开关 | 请求体 `thinking_enabled: false` | options `thinking: true` |

**共同设计模式**：

- 流式增量渲染统一收敛到 `chan.append` / `appendLine`，thinking 块用 `---` 包裹；
- 搜索结果 / 引用统一持久化到 `~/.cache/chat_<Name>/{chatId}-{msgid}-search.json`（及 `-refs.json`），
  供事后 `showItem` 点击回看；
- 错误统一 `ExtError(ERR_KIMI / ERR_DEEPSEEK / ERR_AUTH)` 区分来源；
- 不依赖任何第三方 HTTP 库 / SDK，纯手写协议逆向。

---

## 依赖的 comm 模块

### http.ts

- `sendHttpRequest(req)` —— 一次性请求，`HttpResponse {statusCode, headers, body, error}`；
  **永不 reject，错误通过 `error` 字段返回**；
- `sendHttpRequestWithCallback(req, cb)` —— 流式请求，`onData/onEnd/onError/onTimeout` 回调；
- `genHttpRequestArgs` —— 代理支持：https 走 CONNECT 隧道（`simpleHttpsProxy`），
  http 改写为绝对路径形式的代理请求；
- `simpleHttpDownloadFile(url, path)` —— 下载文件到本地（deepseek wasm 用），
  支持 `http_proxy/https_proxy` 环境变量。

### common.ts

- `ExtError`：错误码 `ERR_HTTP=-1, ERR_AUTH=-2, ERR_KIMI=-3, ERR_DEEPSEEK=-4, ERR_COMM_AI=-5, ERR_ZAI=-6`；
- `getEnvHttpProxy(is_https)`：读 `http_proxy` / `https_proxy` 环境变量；
- 其余：`getCallStack`、`stringify`、`getRandomId` 等小工具。

---

## 已知问题与注意事项

1. **deepseek.ts `getWasm()` 条件疑似写反**：
   `if ((await fsAccess(wasmPath, fs.constants.R_OK)) != null)` 时才下载 ——
   按语义应为“文件不存在才下载”（fsAccess 存在时返回 null）。当前写法在文件存在时反而重复下载，
   文件不存在时跳过下载直接读取必然失败。
2. **kimi.ts `showHistoryMessages` 中 `.reverse()` 原地反转**：
   user 消息 `msg.blocks.reverse()` 直接修改了数组（顺序颠倒，可能是无意副作用）；
   `chatScroll()` 里的 `obj.messages.reverse()` 同理。
3. **私有接口**：两端走的都是网页版私有 API，无任何兼容性承诺，接口变更（路径、PoW、事件格式）需持续跟进。
4. **认证凭据**：DeepSeek authKey 与 Kimi rtoken 均为网页登录凭据，泄露等同于账号泄露。
5. `ChunkDecoder` 将无法解析的行交给 debug 日志而非报错，协议不匹配时表现为“静默无输出”。
