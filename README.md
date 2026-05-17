# Gemini to OpenAI Compatible Proxy

一个运行在 Cloudflare Workers 上的代理服务，将 Google Gemini API 转换为 OpenAI 兼容格式，**支持流式输出**。

## ✨ 特性

- ✅ **OpenAI 兼容格式** - 可直接用于 WorkBuddy、Open WebUI、Chatbox 等客户端
- ✅ **流式输出支持** - 支持 `stream: true`，实时输出响应
- ✅ **非流式输出支持** - 也支持完整的 JSON 响应
- ✅ **CORS 支持** - 跨域请求无忧
- ✅ **轻量高效** - 仅 ~200 行代码，部署快速
- ✅ **免费托管** - 利用 Cloudflare Workers 免费额度

## 🚀 快速开始

### 1. 前置要求

- [Cloudflare 账号](https://cloudflare.com) (免费)
- [Gemini API Key](https://aistudio.google.com/app/apikey) (免费)
- [Node.js](https://nodejs.org/) (v16+)

### 2. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 3. 配置 API Key

```bash
wrangler secret put GEMINI_API_KEY
# 然后输入你的 Gemini API Key
```

### 4. 配置 Cloudflare Account ID

编辑 `wrangler.toml`，填入你的 Account ID（从 [Cloudflare Dashboard](https://dash.cloudflare.com) 获取）：

```toml
account_id = "你的_CLOUDFLARE_ACCOUNT_ID"
```

### 5. 部署

```bash
wrangler deploy
```

部署成功后会得到类似这样的 URL：
```
✨  Success! Your worker was deployed.
📋  https://gemini-openai-proxy.你的子域名.workers.dev
```

## 🔧 使用方法

### 在 WorkBuddy 中使用

1. 打开 WorkBuddy 设置
2. 填写：
   - **API Base URL**: `https://gemini-openai-proxy.你的子域名.workers.dev/v1`
   - **API Key**: 任意值（Worker 不验证，或填 `gemini`）
   - **Model**: `gemini-pro`
3. ✅ 勾选 **Stream Response**
4. 保存并测试

### 在 Open WebUI 中使用

```bash
# Docker 启动示例
docker run -d -p 3000:8080 \
  -e OPENAI_API_BASE_URL=https://gemini-openai-proxy.你的子域名.workers.dev/v1 \
  -e OPENAI_API_KEY=gemini \
  --name open-webui \
  ghcr.io/open-webui/open-webui:main
```

### API 调用示例

#### 非流式请求

```bash
curl https://gemini-openai-proxy.你的子域名.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-pro",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

#### 流式请求

```bash
curl https://gemini-openai-proxy.你的子域名.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-pro",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

#### 获取模型列表

```bash
curl https://gemini-openai-proxy.你的子域名.workers.dev/v1/models
```

## 📝 支持的模型

| OpenAI 模型名称 | Gemini 模型名称 |
|----------------|----------------|
| `gpt-3.5-turbo` | `gemini-pro` |
| `gpt-4` | `gemini-pro` |
| `gpt-4-turbo` | `gemini-pro` |
| `gemini-pro` | `gemini-pro` |
| `gemini-pro-vision` | `gemini-pro-vision` |

## 🛠️ 本地开发

```bash
# 安装依赖
npm install

# 启动本地开发服务器
wrangler dev

# 访问 http://localhost:8787
```

测试本地端点：

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-pro",
    "messages": [{"role": "user", "content": "Hello from local!"}]
  }'
```

## 🔒 安全建议

1. **使用 Wrangler Secrets 存储 API Key**（已做）
2. **限制访问来源**：在 Cloudflare Dashboard 中配置 Access Rules
3. **添加 API Key 验证**：如需保护你的 Worker，可修改代码添加 Bearer Token 验证
4. **监控用量**：在 Cloudflare Dashboard 查看请求日志和错误

## 🐛 故障排查

### 问题：WorkBuddy 报错 "Failed to fetch"

**原因**：Worker 未正确部署或 URL 配置错误

**解决**：
1. 检查 Worker 是否部署成功：`wrangler deployments list`
2. 访问 `https://你的Worker地址/health` 检查健康状态
3. 确认 WorkBuddy 中的 API Base URL 包含 `/v1` 后缀

### 问题：流式输出不工作

**原因**：Worker 代码中 `streamGenerateContent` 未正确实现

**解决**：
1. 确认你使用的是最新版 `worker.js`（包含流式支持）
2. 检查 Gemini API Key 是否有访问 `streamGenerateContent` 的权限
3. 查看 Cloudflare Worker 日志：`wrangler tail`

### 问题：CORS 错误

**原因**：跨域请求被阻止

**解决**：代码中已包含 CORS 处理，如果仍有问题，检查：
1. Worker 是否正确返回 `Access-Control-Allow-Origin: *`
2. 客户端是否发送了正确的 `Content-Type: application/json`

## 📄 许可证

MIT License - 随意使用和修改

## 🙏 致谢

- [Google Gemini API](https://ai.google.dev/)
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)

## 📬 联系方式

如有问题或建议，欢迎提交 Issue！

---

**⭐ 如果这个项目对你有帮助，请给它一个 Star！**
