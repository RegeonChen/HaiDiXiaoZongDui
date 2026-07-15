/**
 * OpenAI-compatible Chat Completions HTTP 客户端
 * Task 3.3: Database and AI Services
 *
 * 职责：
 *  - 向用户配置的 Provider（OpenAI / 兼容 API）发送 chat/completions 请求
 *  - 超时控制、HTTP 错误处理、API 错误响应解析
 *  - 返回纯文本内容（choices[0].message.content）
 */

import type { AIProvider } from '../../../../shared/types';

// ============================================================
// 类型
// ============================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  /** 温度 0-2，默认 0.3（AI 任务倾向确定性输出） */
  temperature?: number;
  /** 最大生成 token 数 */
  maxTokens?: number;
  /** 超时毫秒，默认 120_000（2 分钟） */
  timeoutMs?: number;
}

interface OpenAIErrorResponse {
  error?: { message: string; type?: string; code?: string };
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 发送 chat completion 请求，返回模型输出文本。
 * 出错时抛出带 message 的 Error。
 */
export async function chatCompletion(
  provider: AIProvider,
  messages: ChatMessage[],
  options: ChatCompletionOptions = {}
): Promise<string> {
  const { temperature = 0.3, maxTokens = 4096, timeoutMs = 120_000 } = options;

  // provider 不存明文 apiKey；需从 ai_providers 表补充
  // 调用方（Agent）负责传入已填充 apiKey 的 provider（通过 getById 内部获取）
  const apiKey = (provider as AIProvider & { _apiKey?: string })._apiKey as string | undefined;
  if (!apiKey) {
    throw new Error('Provider API Key 未配置');
  }

  const baseUrl = provider.baseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: provider.modelName,
        messages,
        temperature,
        max_tokens: maxTokens
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as OpenAIErrorResponse;
        if (body.error?.message) detail += `: ${body.error.message}`;
      } catch { /* ignore parse errors */ }
      throw new Error(detail);
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[];
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('模型返回空内容');
    }

    return content;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(`请求超时（${timeoutMs / 1000}s）`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 轻量级连接测试：发送一条简短消息，验证 API 可达且 Key 有效。
 */
export async function testConnection(provider: AIProvider, apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    await chatCompletion(
      { ...provider, _apiKey: apiKey } as AIProvider & { _apiKey: string },
      [{ role: 'user', content: 'Reply with just "OK".' }],
      { maxTokens: 10, temperature: 0, timeoutMs: 15_000 }
    );
    return { ok: true, message: '连接成功' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '未知错误' };
  }
}
