// worker.js - Gemini to OpenAI Compatible Proxy with Streaming Support
// 支持 WorkBuddy / Open WebUI / ANY OpenAI 兼容客户端

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  
  // CORS 处理
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  // 健康检查
  if (url.pathname === '/health') {
    return jsonResponse({ status: 'ok', provider: 'gemini' });
  }

  // OpenAI 兼容端点
  if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
    return handleOpenAICompat(request, env);
  }

  // 模型列表
  if (url.pathname === '/v1/models' && request.method === 'GET') {
    return handleListModels();
  }

  return new Response('Not Found', { status: 404 });
}

async function handleOpenAICompat(request, env) {
  const apiKey = env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return jsonResponse({ error: 'GEMINI_API_KEY not configured' }, 500);
  }

  let requestBody;
  try {
    requestBody = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { model, messages, stream, temperature, max_tokens, top_p } = requestBody;
  
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

  // 🔥 流式响应
  if (stream === true) {
    return handleStreamingResponse(apiUrl, apiKey, geminiRequest);
  }
  
  // 非流式响应
  return handleNonStreamingResponse(apiUrl, apiKey, geminiRequest);
}

// 🔥 流式响应处理
async function handleStreamingResponse(apiUrl, apiKey, geminiRequest) {
  const url = `${apiUrl}:streamGenerateContent?alt=sse&key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiRequest)
  });

  if (!response.ok) {
    const errorText = await response.text();
    return new Response(`data: ${JSON.stringify({ error: errorText })}\n\n`, {
      headers: { 'Content-Type': 'text/event-stream' }
    });
  }

  // 转换 Gemini SSE → OpenAI SSE
  const transformStream = new TransformStream({
    async transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);
      const lines = text.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const json = JSON.parse(data);
            const openaiChunk = convertGeminiStreamToOpenAI(json);
            if (openaiChunk) {
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openaiChunk)}\n\n`));
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    },
    flush(controller) {
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
    }
  });

  return new Response(response.body.pipeThrough(transformStream), {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// 非流式响应
async function handleNonStreamingResponse(apiUrl, apiKey, geminiRequest) {
  const url = `${apiUrl}:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiRequest)
  });

  const data = await response.json();
  
  if (!response.ok) {
    return jsonResponse({ error: data }, response.status);
  }

  // 转换 Gemini 响应 → OpenAI 格式
  const openaiResponse = convertGeminiToOpenAI(data);
  return jsonResponse(openaiResponse);
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
    } else if (msg.role === 'assistant') {  // ✅ 修复：正确拼写为 'assistant'
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
        role: 'assistant',  // ✅ 修复：正确拼写为 'assistant'
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

// 模型列表
function handleListModels() {
  return jsonResponse({
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
}

// JSON 响应辅助函数
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
