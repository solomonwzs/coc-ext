# Xiaomi MiMo Studio(aistudio.xiaomimimo.com)逆向分析

> 通过 chrome-devtools MCP 捕获网站实际请求 + 分析前端 JS bundle,逆向其 Web 私有 API。
> 捕获时间:2026-10-19;账号:已登录的普通用户会话(token 值已在文中脱敏)。

## 目录

- [网站概况](#网站概况)
- [登录与认证](#登录与认证)
- [API 总览](#api-总览)
- [核心:聊天补全协议 react/chat](#核心聊天补全协议-reactchat)
- [会话与历史消息](#会话与历史消息)
- [模型配置(bot/config)](#模型配置botconfig)
- [前端实现细节](#前端实现细节)
- [观察到的异常与会话失效](#观察到的异常与会话失效)
- [对照 src/lib/ai 的实现建议](#对照-srclibai-的实现建议)

## 网站概况

| 项 | 值 |
|---|---|
| 站点 | Xiaomi MiMo Studio(小米大模型演示平台,"非正式 AI 助手") |
| 前端 | React SPA(hash 路由 `#/`),webpack 分 chunk |
| 网关 | `server: MiFE/3.4.34`(小米前端网关),响应头带 `_trace_id_` |
| 功能分区 | MiMo Chat(普通聊天)/ MiMo Claw(Agent,模型 clawm-alpha 等)/ UltraSpeed(极速,独立 `/fastchat` 前缀) |
| 周边能力 | TTS(CDN 下发音色表 + ffmpeg.wasm 本地处理)、ASR、liveKit(语音)、文件上传(≤100MB、≤50 个)、分享 |

## 登录与认证

### 小米账号 SSO

前端配置中登录入口为 `${fastchat前缀}/open-apis/v1/genLoginUrl`,登出为 `/open-apis/user/mi/logout`。
会话失效时任何 API 返回 401 + `loginUrl`,格式:

```json
{
  "code": 401,
  "loginUrl": "https://account.xiaomi.com/pass/serviceLogin?callback=https%3A%2F%2Faistudio.xiaomimimo.com%2Fsts%3Fsign%3D...%26followup%3Dhttp%3A%2F%2F...&sid=xiaomichatbot&_group=DEFAULT"
}
```

- **sid = `xiaomichatbot`**(小米passport的服务ID)
- 登录回调到 `aistudio.xiaomimimo.com/sts?sign=...`,由 STS 落 cookie

### Cookie(认证凭据)

| Cookie | 说明 |
|---|---|
| `xiaomichatbot_serviceToken` | **HttpOnly**,核心凭据,JS 不可读(document.cookie 中不可见) |
| `userId` | 数字账号 ID,JS 可读 |
| `xiaomichatbot_ph` | 随会话签发的校验值(base64 样式,如 `b5OyYDPaoyV/atkY+v7ukw==`),JS 可读 |

### `xiaomichatbot_ph` 查询参数

**所有 open-apis 写请求**都必须把 `xiaomichatbot_ph` cookie 的值**复制为同名查询参数**:

```
POST /open-apis/react/chat?xiaomichatbot_ph=b5OyYDPaoyV%2FatkY%2Bv7ukw%3D%3D
```

cookie 名按环境映射(逆向自 main.js):

```js
{
  development: "michatbot_ph", "development-preview": "pre-michatbot_ph",
  review: "michatbot_ph", staging: "michatbot_ph", preview: "pre-michatbot_ph",
  inner: "michatbot_ph", "overseas-preview": "preoverseas-chatbot_ph",
  production: "xiaomichatbot_ph",
  ultra: "ultraspeed_ph", "ultra-review": "ultraspeed_ph", "ultra-production": "ultraspeed_ph"
}
```

UltraSpeed 环境使用 `ultraspeed_ph` cookie + `/fastchat` URL 前缀。

### 关键请求头

- `content-type: application/json`(SSE 接口响应为 `text/event-stream`)
- `x-timezone: Asia/Shanghai`(自定义)
- `traceparent: 00-<32hex traceId>-<16hex spanId>-01`(W3C Trace Context,前端生成)
- `origin/referer: https://aistudio.xiaomimimo.com/`
- 无 Authorization 头、无签名算法 —— **认证完全依赖 cookie + ph 查询参数**

## API 总览

响应统一为 `{code: 0, msg: "成功", data: ...}`;失败时 `code` 为错误码(401 时附带 `loginUrl`)。

| 方法 | 路径 | 用途 | 请求体 |
|---|---|---|---|
| GET | `/open-apis/user/mi/get` | 用户信息(昵称/头像/封禁状态/tokenPlan/`reactEnabled`/`abtest`) | — |
| GET | `/open-apis/bot/config` | 模型配置列表 | — |
| GET | `/open-apis/user/mimo-claw/status` | MiMo Claw 资源/计费状态(轮询) | — |
| POST | `/open-apis/chat/conversation/list` | 会话列表 | `{"pageInfo":{"pageNum":1,"pageSize":20}}` |
| POST | `/fastchat/open-apis/chat/conversation/list` | UltraSpeed 会话列表(独立存储) | 同上 |
| POST | `/open-apis/chat/conversation/save` | 创建会话 | `{"conversationId":"<前端生成32hex>","title":"New conversation","type":"chat"}` |
| POST | `/open-apis/chat/conversation/genTitle` | LLM 生成标题 | `{"conversationId":"...","content":"<query+回答拼接>"}` |
| POST | `/open-apis/react/chat` | **聊天补全(SSE 流)** | 见下文 |
| POST | `/open-apis/react/dialog/list` | 历史消息 | `{"queryParam":{"conversationId":"..."},"pageInfo":{"pageNum":1,"pageSize":10}}` |
| POST | `/open-apis/user/mi/logout` | 登出 | — |
| — | `/open-apis/v1/genLoginUrl` | 生成登录 URL | — |
| — | `/open-apis/asr` `/open-apis/tts` `/open-apis/chat/liveKit` | 语音识别/合成/实时音视频(路径见于 JS,未捕获请求体) | — |
| — | `/open-apis/share` `/open-apis/resource`(`/genNewUrl`) `/open-apis/audit` `/open-apis/contact` `/open-apis/agreement/event` | 分享/资源签名续期/审计/联系方式/协议事件 | — |

会话列表响应示例:

```json
{"code":0,"msg":"成功","data":{"total":1,"pageNum":1,"dataList":[
  {"id":9211206,"creator":"1504903118","title":"Vim退出方法大全",
   "conversationId":"c90b68341131e4f0dc533884f2a709a3","type":"chat", ...}]}}
```

注意:数据库主键 `id` 与业务 `conversationId`(32 位 hex,前端本地生成)并存,聊天 API 一律用 `conversationId`。

## 核心:聊天补全协议 react/chat

### 请求

```
POST /open-apis/react/chat?xiaomichatbot_ph=<cookie值>
Content-Type: application/json
```

```json
{
  "msgId": "58fbbe5ebb0e4909d03e2f8287e0e590",
  "conversationId": "a119746bdf99b1e90b78f357bcf9f60e",
  "query": "你好,请用一句话介绍你自己",
  "isEditedQuery": false,
  "modelConfig": {
    "enableThinking": false,
    "webSearchStatus": "disabled",
    "model": "mimo-v2.6-pro"
  },
  "multiMedias": []
}
```

- `msgId`:32 位 hex,**前端生成**(crypto 随机即可)
- `conversationId`:32 位 hex,前端生成,首次发消息前先调 `conversation/save` 注册
- `modelConfig.webSearchStatus`:`disabled` / `auto`(bot/config 中 `webSearchDefaultStatus`)
- `multiMedias`:多模态附件(图片/文件引用)

### 响应(SSE,`text/event-stream`)

每个事件块三行:`id:` / `event:` / `data:`,事件类型 4 种:

```
id:602002643e5ce05026de3013f74978c7
event:dialogId
data:{"content":"31905223"}          ← 服务端分配的对话(dialog)ID

id:...
event:message
data:{"messageType":"assistant","reasoningContent":"The user is"}   ← 思维链增量

id:...
event:message
data:{"messageType":"assistant","content":"你好!我是 MiMo"}        ← 正文增量

id:...
event:usage
data:{"promptTokens":3752,"completionTokens":56,"totalTokens":3808,
      "nativeUsage":{"completion_tokens":56,"prompt_tokens":3752,"total_tokens":3808,
      "prompt_tokens_details":{"cached_tokens":3712},
      "completion_tokens_details":{"reasoning_tokens":29}}}        ← 用量(重复发两次)

id:...
event:finish
data:{"content":"[DONE]"}            ← 结束标记
```

要点:

1. **增量拼接**:`message` 事件的 `data.content`/`data.reasoningContent` 是文本片段,客户端按序拼接;
2. thinking 与正文通过**字段名区分**(`reasoningContent` vs `content`),无单独事件;
3. `usage` 事件发两次(推测首末各一次),含 OpenAI 风格的 `nativeUsage` 与 cached/reasoning token 明细;
4. 实测 `enableThinking:false` 时**仍会**下发 `reasoningContent`(thinking 不能真正关闭,只是 UI 可不展示);
5. 无心跳事件,流以 `finish` 结束。

## 会话与历史消息

### 创建会话(conversation/save)

请求:`{"conversationId":"<前端生成>","title":"New conversation","type":"chat"}`
响应返回数据库记录(含自增 `id`)。随后即可用该 `conversationId` 发消息。

### 生成标题(genTitle)

前端把 **query + 完整回答**(reasoning + content 拼接)POST 给 `genTitle`,服务端用 LLM 生成标题:

```json
{"conversationId":"...","content":"<query> <reasoning...>\n\n<answer>"}
→ {"code":0,"msg":"成功","data":"AI智能助手介绍"}
```

### 历史消息(react/dialog/list)

请求:`{"queryParam":{"conversationId":"..."},"pageInfo":{"pageNum":1,"pageSize":10}}`

响应(节选,一轮对话一条记录):

```json
{"code":0,"msg":"成功","data":[{
  "conversationId":"c90b68341131e4f0dc533884f2a709a3",
  "msgId":"3433e88e455884fb2d5f538c688659ab",
  "inputInfo":{"query":"如何关闭 vim","multiMedias":[]},
  "createTime":"2026-09-22 11:22:23",
  "dialogLogDetailList":[{
    "id":30109200,
    "result":[
      {"messageType":"assistant","reasoningContent":"<完整思维链>"},
      {"messageType":"assistant","content":"<完整回答 markdown>"}
    ],
    "dialogStatus":"success",
    "model":"mimo-v2.6-pro",
    "modelConfig":"{\"enableThinking\":true,\"model\":\"mimo-v2.6-pro\",\"temperature\":0.8,\"topP\":0.95,\"webSearchStatus\":\"disabled\"}",
    "usage":{"promptTokens":2229,"completionTokens":602,"totalTokens":2831,"queryTokens":2149,"assistantTokens":435,"reasoningTokens":167},
    "modelCostTime":8413,
    "thinkingCostTime":5162,
    "version":"v2"
  }]
}]}
```

注意 `modelConfig` 是 **JSON 字符串**(需二次解析);`result` 数组内 reasoning 与 content 分元素;`usage` 比流式事件多了 `queryTokens`/`assistantTokens` 明细与耗时统计。

### 联网搜索与引用(已验证,2026-10-20 捕获)

`webSearchStatus: "auto"` 时模型**自主决定**是否调用 search 工具。带搜索的一轮对话,`dialogLogDetailList[].result[]` 完整序列为:

| 序号 | messageType | 字段 | 含义 |
|---|---|---|---|
| 0 | `assistant` | `reasoningContent` | 检索前思考(含是否需要搜索的判断、检索词设计) |
| 1 | `assistant` | `content` | 前置说明(如"我先快速检索一下...") |
| 2 | `assistant` | `toolCalls` | 工具调用 |
| 3 | `tool` | `responses` | 搜索结果 |
| 4 | `assistant` | `reasoningContent` | 检索后思考 |
| 5 | `assistant` | `content` | 最终回答(含 citation 标记) |

(前置说明/检索后思考可为空,序列会收缩;无搜索时退化为 `reasoningContent` + `content` 两元素。)

**工具调用**(OpenAI function-call 风格):

```json
{"messageType":"assistant","toolCalls":[{
  "arguments":"{\"queries\":[\"GLM 5.3 flash 参数量\",\"GLM-5.3 Flash 模型 规格\"]}",
  "id":"call_78850a10faa74096a470ad48",
  "name":"search","type":"function"
}]}
```

**搜索结果**(messageType=`tool`,`responseData` 是 JSON 字符串):

```json
{"messageType":"tool","responses":[{
  "id":"call_78850a10faa74096a470ad48",
  "name":"search",
  "responseData":"[{\"url\":\"https://...\",\"title\":\"...\",\"site\":\"知乎专栏\",\"displayUrl\":null,\"summary\":\"...\",\"siteIcon\":\"https://zhihu.com/favicon.ico\",\"datePublished\":\"2026-05-21T09:27:00.0000000\",\"dateLastCrawled\":null,\"index\":1}, ...]"
}]}
```

条目字段:`url` / `title` / `site` / `displayUrl` / `summary` / `siteIcon` / `datePublished` / `dateLastCrawled` / `index`(从 1 递增)。

### citation 标记(已验证)

最终回答 content 中内联标记 **`[citation:N]`**(与 DeepSeek 同格式),`N` 对应搜索结果条目的 `index`:

```markdown
RTX 全称是 Ray Tracing Texel eXtreme,从 2018 年的 RTX 20 系开始
成为 NVIDIA 的主力品牌 [citation:1][citation:3]。具体区别如下:
```

- 标记可连续出现(如 `[citation:1][citation:3]`);
- 前端渲染为上标数字按钮,点击弹出来源详情;底部另有 "Citation sources (N)" 汇总面板;
- 历史 dialog 与渲染一致:showItem 需要的 segmentId(对话框 id)与搜索结果的映射关系完整存在。

**待捕获**:~~流式 react/chat 中的工具调用/搜索结果如何以 SSE 事件下发~~ —— **已还原**(2026-10-20,从 main chunk 的 SSE transformer `F` 与分发器 `ei` 静态分析,未抓包):`message` 事件的数据对象可携带 `toolCalls` / `responses` 键,详见下节。

### 流式搜索协议(前端源码还原,100% 确定)

SSE transformer(逆向自 main chunk `function*F(e)`,react/chat = reactCompletions = **v3**):

```
允许事件:dialogId / message / usage / finish / error / sensitive_query /
          sensitive_title / tip_ratio / tip_truncate
message data 解析顺序:
  1. messageType ∈ {error, sensitive_query, sensitive_title, tip_ratio, tip_truncate}
     → 对应错误/敏感/提示处理(payload = data.content)
  2. data.toolCalls  → 工具调用开始(渲染为 loading 状态)
  3. data.responses  → 工具结果;search 工具的 responseData 即搜索结果,
     逐条追加到 dialog.webSearchResults(前端 SK 提取器)
  4. data.reasoningContent → 思维链增量
  5. data.content   → 正文增量(最终含 [citation:N])
其他事件:dialogId → {content: 数字串};usage / finish 可携带 thinkingCostTime
```

带搜索的一轮流式事件序列(重建):

```
event:dialogId   data:{"content":"31913109"}
event:message    data:{"messageType":"assistant","reasoningContent":"..."}
event:message    data:{"messageType":"assistant","content":"我先检索一下。"}
event:message    data:{"messageType":"assistant","toolCalls":[{"arguments":"{\"queries\":[...]}","id":"call_xxx","name":"search","type":"function"}]}
event:message    data:{"messageType":"tool","responses":[{"id":"call_xxx","name":"search","responseData":"<JSON 字符串,可能双重编码>"}]}
event:message    data:{"messageType":"assistant","reasoningContent":"..."}
event:message    data:{"messageType":"assistant","content":"... [citation:1] [citation:3] ..."}
event:usage      data:{...}
event:finish     data:{"content":"[DONE]"}
```

**v2 端点**(/open-apis/bot/chat,非 react 模型):搜索结果不走 message 事件,而是独立 `event:web_search` 直接携带结果数组;`event:doc` 携带 `processStart`(webSearch/docParse)。另有 `scrape` 工具(网页正文抓取)。

### 联网开关的服务端控制(2026-10-20 状态)

- bot/config 的 modelConfigList 每模型携带 `webSearchDefaultStatus` / `showWebSearch`
- **当前全部模型 `showWebSearch:false`** —— UI 开关不渲染,无法通过界面打开
- 请求构造(前端 `et` 函数):`webSearchStatus = webSearchEnabled && 无附件 ? sessionWebSearchMode : "disabled"`
- 会话级开关状态存于 localStorage `modelConfigMap`(home/会话 ID → webSearchStatus/webSearchMode)

### ⚠ ph 参数错误会立即吊销会话(已两次复现)

页面上下文 fetch 携带**带引号的** ph cookie 值(`"xxx=="`)作为查询参数 → 401 → 服务端立即吊销整个会话(cookie 清空,`user/mi/get` 401),需重新 SSO 登录。实现时必须严格去引号(MimoChat 的 `withPh()` 已处理)。

## 模型配置(bot/config)

`data.modelConfigList[]` 每项含 `name`(展示名)/`model`(API 名)/`temperature`/`topP`/`thinkingDefaultOn`/`webSearchDefaultStatus`/文件上传限制/OCR 开关/场景列表。捕获到的模型:

| model(API 名) | name(展示) | 说明 |
|---|---|---|
| `mimo-v2.6-pro` | MiMo-V2.6-Pro | 默认旗舰,1T 参数/1M 上下文,多模态生文 |
| `mimo-v2.6-flash` | MiMo-V2.6-Flash | 高性价比日常,300B/1M |
| `mimo-v2.6-pro-ultraspeed-studio` | MiMo-V2.6-Pro-UltraSpeed | 极速响应,走 `/fastchat` 体系 |
| `mimo-v2-pro` `mimo-v2.5-pro` `mimo-v2-flash(-studio)` | — | 旧版本模型 |
| `mimo-v2-omni` `mimo-v2.5` `mimo-v2.1-omni(-preview)` | mimo-omni | 全模态 |
| `clawm-alpha` | — | MiMo Claw(Agent)默认模型 |
| `clawl-alpha` | mimo-V2-pro | MiMo Claw 备选 |

文件上传限制:≤100MB/文件,≤50 个,支持 txt/pdf/jpeg/png(部分模型支持代码文本类型)。

## 前端实现细节

- **cookie 读取**(main.js 内联工具,等价于):

```js
const readCookie = (name) => {
  const p = encodeURIComponent(name) + '=';
  for (const c of document.cookie.split('; '))
    if (c.startsWith(p))
      return decodeURIComponent(c.slice(p.length)).replaceAll(/^"|"$/g, '').trim();
};
```

- **UltraSpeed 前缀**:`["ultra","ultra-review","ultra-production"].includes(env) ? "/fastchat" : ""`,拼在所有 open-apis 路径前;普通站点的 UltraSpeed 分区同样请求 `/fastchat/open-apis/...`(会话列表独立)。
- **流式客户端**:fetch + ReadableStream + AbortController,非 EventSource(需 POST body);存在 v3 版本协议封装(`reactCompletions`,带 `getDialog`/断线恢复 `complete` 逻辑)。
- **上报**:`tracking.miui.com/track/v4/js_a`(埋点)、`apm-rum.inf.miui.com/intake/v2/rum/events`(APM,大量 503)、traceparent 链路追踪。
- **CDN**:`aistudio-cdn.xiaomimimo.com`(ffmpeg.wasm、TTS 音色映射 TSV 等)、`cdn.cnbj1.fds.api.mi-img.com`(头像)。
- 用户信息含 `watermark`(水印串)、`abtest`(base64 的 `{}`)、`tokenPlan`(订阅额度)等字段。

## 观察到的异常与会话失效

测试过程中(约登录态捕获 3~5 分钟后)cookie 突然全部消失,后续所有 API 返回 401+loginUrl(页面 UI 因客户端缓存仍显示已登录)。两种可能:

1. **serviceToken 短时效**,静默过期(需 STS 滚动刷新);
2. **反重放保护**:手工重放 `react/chat` 时 ph 参数缺失/不合法(`followup` 中回显 `xiaomichatbot_ph=undefined`),疑似触发服务端吊销会话。

逆向实现时需注意:**ph 查询参数必须与 cookie 值严格一致**,且不排除服务端对 ph 与 serviceToken 的绑定校验;实现中应原样携带浏览器 cookie 并随 401-loginUrl 重新走 SSO。

## 对照 src/lib/ai 的实现(已完成)

实现见 `src/lib/ai/mimo.ts`(`MimoChat extends BaseChat`),接入见 `src/ai/mimo.ts`(env: `MY_AI_MIMO_SERVICE_TOKEN` / `MY_AI_MIMO_USER_ID` / `MY_AI_MIMO_PH`),已注册进 `src/ai/chat.ts` 的 `name2AiChat`(CocList: `aichat_Mimo`)。

| BaseChat 抽象 | MimoChat 实现 |
|---|---|
| `getChatName()` | `'Mimo'`(缓存目录 `~/.cache/chat_Mimo`) |
| 认证 | 无需 token 刷新:三个 cookie(serviceToken/userId/ph);每个 POST URL 拼 `?xiaomichatbot_ph=`;每次请求生成 `traceparent` |
| `getChatList()` | POST `conversation/list`,`description` 用 `updateTime` |
| `createChatId()` | 本地生成 32hex → POST `conversation/save` 注册 |
| `chat(text)` | POST `react/chat`,复用 `ChunkDecoder` 解 SSE;message 事件可携带 toolCalls/responses(搜索工具,打印 `[searching...]` / `[search result (N)]` 并缓存结果)与 reasoning/content 增量;`messageType` 可携带 error/sensitive 标记;首条消息后自动 `genTitle` |
| 多轮连续性 | 请求体带 `previousDialogueId`(上一轮 dialogId,由 dialogId 事件 / 历史记录维护) |
| `showHistoryMessages()` | POST `react/dialog/list`,按 `createTime` 升序渲染,`result[]` 分 reasoning/content 渲染,toolCalls/responses 渲染搜索标记并缓存搜索结果 |
| `showItem()` | ✅ 已实现:光标在 `[citation:N]` → popup 对应搜索来源;光标在 `[search result (N)]` → 打开全部来源列表(与 deepseek 同交互) |
| `delSession()` | POST `conversation/delete`,body 为 `conversationId` 数组(逆向自前端 `batchDelete`) |
| 结束标记 | `event:finish` + `data:{"content":"[DONE]"}` |
| 错误处理 | `{code:401, loginUrl}` → `ExtError(ERR_AUTH)`(含 loginUrl);新增错误码 `ERR_MIMO = -7` |

离线端到端测试:`src/test/mimo_test.ts`(本地 HTTPS 服务器回放真实捕获的 SSE 流,验证请求构造/ph 参数/cookie/流式渲染/多轮/标题生成/删除),`npm run build_test && node dist/test.js`。

SSE 事件全集(逆向自前端 `completions` 解析器):`dialogId` / `message` / `usage` / `finish` / `error` / `sensitive_query` / `sensitive_title` / `web_search` / `doc` / `tip_ratio` / `tip_truncate`;`finish` 事件可携带 `thinkingCostTime`;`dialog/list` 支持分页参数 `endId`。
