// server.js - Gemini to OpenAI Compatible Proxy (Node.js Express)
// 支持 WorkBuddy / Open WebUI / ANY OpenAI 兼容客户端

const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', provider: 'gemini' });
});

// OpenAI 兼容端点
app.post('/v1/chat/completions', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  const { model, messages, stream, temperature, max_tokens, top_p } = req.body;
  
  // 转换 OpenAI 格式 → Gemini 格式
  const geminiRequest = {
    contents: convertMessagesToGemini(messages),
    generationConfig: {
      ...(temperature !== undefined && { temperature }),
      ...(max_tokens !== undefined && { maxOutputTokens: max_tokens }),
      ...(top_p !== undefined && { topP: top_p }),
    }
  };

  const geminiModel = convertModelName(model);
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}`;

  // 流式响应
  if (stream === true) {
    return handleStreamingResponse(req, res, apiUrl, apiKey, geminiRequest);
  }
  
  // 非流式响应
  return handleNonStreamingResponse(req, res, apiUrl, apiKey, geminiRequest);
});

// 模型列表
app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      {
        id: 'gemini-pro',
        object: 'model',
        created: 1706745600,
        owned_by: 'google'
      },
      {
        id: 'gemini-pro-vision',
        object: 'model',
        created: 1706745600,
        owned_by: 'google'
      }
    ]
  });
});

// 🔥 流式响应处理
async function handleStreamingResponse(req, res, apiUrl, apiKey, geminiRequest) {
  const url = `${apiUrl}:streamGenerateContent?alt=sse&key=${apiKey}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.send(`data: ${JSON.stringify({ error: errorText })}\n\n`);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const json = JSON.parse(data);
            const openaiChunk = convertGeminiStreamToOpenAI(json);
            if (openaiChunk) {
              res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Streaming error:', error);
    res.status(500).send(`data: ${JSON.stringify({ error: error.message })}\n\n`);
  }
}

// 非流式响应
async function handleNonStreamingResponse(req, res, apiUrl, apiKey, geminiRequest) {
  const url = `${apiUrl}:generateContent?key=${apiKey}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiRequest)
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    // 转换 Gemini 响应 → OpenAI 格式
    const openaiResponse = convertGeminiToOpenAI(data);
    res.json(openaiResponse);
  } catch (error) {
    console.error('Non-streaming error:', error);
    res.status(500).json({ error: error.message });
  }
}

// 消息格式转换：OpenAI → Gemini
function convertMessagesToGemini(messages) {
  const contents = [];
  
  for (const msg of messages) {
    if (msg.role === 'system') {
      // Gemini 不支持 system role，合并到 user 消息
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }]
      });
    } else if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }]
      });
    } else if (msg.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text: msg.content }]
      });
    }
  }
  
  return contents;
}

// 响应格式转换：Gemini → OpenAI (非流式)
function convertGeminiToOpenAI(geminiResponse) {
  const text = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gemini-pro',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: text
      },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}

// 流式响应转换：Gemini SSE → OpenAI SSE
function convertGeminiStreamToOpenAI(geminiChunk) {
  const text = geminiChunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  if (!text) return null;
  
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'gemini-pro',
    choices: [{
      index: 0,
      delta: {
        content: text
      },
      finish_reason: null
    }]
  };
}

// 模型名称转换
function convertModelName(openaiModel) {
  const modelMap = {
    'gpt-3.5-turbo': 'gemini-pro',
    'gpt-4': 'gemini-pro',
    'gpt-4-turbo': 'gemini-pro',
    'gemini-pro': 'gemini-pro',
    'gemini-pro-vision': 'gemini-pro-vision'
  };
  
  return modelMap[openaiModel] || 'gemini-pro';
}

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Gemini OpenAI Proxy running on port ${PORT}`);
});
