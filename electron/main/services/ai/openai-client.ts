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
import { classifyAiFailure } from './ai-failure';

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
  /** Qwen 混合思考模型可用；翻译等确定性任务应关闭思考。 */
  enableThinking?: boolean;
  /**
   * 强制模型以 JSON 格式输出。
   * 'json_object' 传递 response_format:{type:'json_object'}；
   * undefined 不限制格式（默认）。
   * 注意：多数 OpenAI-compatible Provider 支持此参数，但部分模型可能忽略或报错。
   */
  responseFormat?: 'json_object';
  /**
   * 每次真正发起 HTTP 请求前触发。只包含尝试次数和格式兼容状态，
   * 不包含 Prompt、响应正文、URL 或凭证，可用于上层记录脱敏诊断。
   */
  onRequestAttempt?: (attempt: ChatCompletionAttemptInfo) => void;
}

export interface ChatCompletionAttemptInfo {
  attempt: number;
  responseFormatSent: boolean;
  responseFormatDowngrade: 'cached_unsupported' | 'provider_rejected' | null;
}

interface OpenAIErrorResponse {
  error?: { message: string; type?: string; code?: string };
}

const responseFormatUnsupportedProviders = new Set<string>();
let configuredAiFetch: typeof fetch | null = null;

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
  const {
    temperature = 0.3,
    maxTokens = 4096,
    timeoutMs = 120_000,
    enableThinking,
    responseFormat,
    onRequestAttempt
  } = options;

  // provider 不存明文 apiKey；需从 ai_providers 表补充
  // 调用方（Agent）负责传入已填充 apiKey 的 provider（通过 getById 内部获取）
  const apiKey = (provider as AIProvider & { _apiKey?: string })._apiKey as string | undefined;
  if (!apiKey) {
    throw new Error('Provider API Key 未配置');
  }

  const baseUrl = provider.baseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;
  const compatibilityKey = responseFormatCompatibilityKey(provider, baseUrl);
  const deadline = Date.now() + timeoutMs;
  let activeResponseFormat = responseFormat;
  let downgradeReason: ChatCompletionAttemptInfo['responseFormatDowngrade'] = null;
  let attempt = 0;

  if (responseFormat && responseFormatUnsupportedProviders.has(compatibilityKey)) {
    activeResponseFormat = undefined;
    downgradeReason = 'cached_unsupported';
  }

  while (true) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error(`请求超时（${timeoutMs / 1000}s）`);
    attempt += 1;
    safelyReportRequestAttempt(onRequestAttempt, {
      attempt,
      responseFormatSent: activeResponseFormat === 'json_object',
      responseFormatDowngrade: downgradeReason
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);
    try {
      const response = await (configuredAiFetch ?? globalThis.fetch)(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: provider.modelName,
          messages,
          temperature,
          max_tokens: maxTokens,
          ...(activeResponseFormat
            ? { response_format: { type: activeResponseFormat } }
            : {}),
          ...(enableThinking === undefined ? {} : { enable_thinking: enableThinking })
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        let providerMessage = '';
        try {
          const body = (await response.json()) as OpenAIErrorResponse;
          if (body.error?.message) {
            providerMessage = body.error.message;
            detail += `: ${providerMessage}`;
          }
        } catch { /* ignore parse errors */ }
        if (
          activeResponseFormat &&
          shouldRetryWithoutResponseFormat(response.status, providerMessage)
        ) {
          responseFormatUnsupportedProviders.add(compatibilityKey);
          activeResponseFormat = undefined;
          downgradeReason = 'provider_rejected';
          continue;
        }
        throw new Error(detail);
      }

      const data = await response.json() as {
        choices?: { message?: { content?: unknown; reasoning_content?: unknown; role?: string } }[];
        error?: { message: string; type?: string };
        model?: string;
      };

      const rawContent = data.choices?.[0]?.message?.content;
      let content = extractMessageText(rawContent);
      // DeepSeek 等推理模型可能将结构化正式答案放入 reasoning_content。
      // 只要调用方原始请求是 JSON 任务就允许回退；普通对话仍不会读取该字段。
      if (!content && responseFormat === 'json_object') {
        const reasoning = data.choices?.[0]?.message?.reasoning_content;
        if (reasoning) {
          content = extractMessageText(reasoning);
        }
      }
      if (!content) {
        // 提供更丰富的诊断信息，帮助用户排查模型/Provider 问题
        const detail: string[] = [];
        if (!data.choices || data.choices.length === 0) {
          detail.push('模型未返回 choices 数组');
        } else if (!data.choices[0].message) {
          detail.push('choices[0] 缺少 message 字段');
        } else if (!content) {
          detail.push(`message.content 无可用文本（原始类型: ${contentType(rawContent)}）`);
          if (data.choices[0].message.reasoning_content) {
            detail.push('模型只返回了 reasoning_content，未返回正式答案');
          }
        }
        if (data.model) detail.push(`模型: ${data.model}`);
        if (data.error) detail.push(`API 错误: ${data.error.message}`);
        const suffix = detail.length > 0 ? ` (${detail.join(', ')})` : '';
        throw new Error(`模型返回空内容${suffix}`);
      }

      return content;
    } catch (e) {
      if (isAbortError(e)) {
        throw new Error(`请求超时（${timeoutMs / 1000}s）`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** 测试和 Provider 配置变更后可显式清除进程内兼容性记忆。 */
export function resetResponseFormatCompatibilityCache(): void {
  responseFormatUnsupportedProviders.clear();
}

/** Main 进程注入 Electron net.fetch，使 AI 请求继承系统代理与 Chromium 网络栈。 */
export function configureAiFetch(fetchImpl: typeof fetch): void {
  configuredAiFetch = fetchImpl;
}

/**
 * OpenAI-compatible 服务中的 content 可能是字符串，也可能是文本 part 数组/对象。
 * 只提取正式答案文本，不读取 reasoning_content。
 */
export function extractMessageText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value)) {
    const parts = value.map(extractMessageText).filter((part): part is string => !!part);
    return parts.length > 0 ? parts.join('') : null;
  }
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  for (const key of ['text', 'content', 'value', 'output_text']) {
    if (key in record) {
      const text = extractMessageText(record[key]);
      if (text) return text;
    }
  }
  return null;
}

function contentType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function responseFormatCompatibilityKey(provider: AIProvider, baseUrl: string): string {
  return `${provider.id}\u0000${baseUrl}\u0000${provider.modelName}`;
}

function safelyReportRequestAttempt(
  callback: ChatCompletionOptions['onRequestAttempt'],
  attempt: ChatCompletionAttemptInfo
): void {
  try {
    callback?.(attempt);
  } catch {
    // 诊断回调不得影响真实 AI 请求。
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (!!error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
  );
}

function shouldRetryWithoutResponseFormat(status: number, message: string): boolean {
  if (status !== 400 && status !== 422) return false;
  if (!message.trim()) return true;
  return /response[\s_-]*format|json[\s_-]*object|structured[\s_-]*output/i.test(message);
}

/**
 * 轻量级连接测试：发送一条简短消息，验证 API 可达且 Key 有效。
 */
export async function testConnection(provider: AIProvider, apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const reply = await chatCompletion(
      { ...provider, _apiKey: apiKey } as AIProvider & { _apiKey: string },
      [{ role: 'user', content: 'Say "OK"' }],
      { maxTokens: 32, temperature: 0, timeoutMs: 15_000 }
    );
    // 有些模型会在 "OK" 前后加空格或引号，只要回复不为空且短就视为成功
    if (reply.trim().length > 0) {
      return { ok: true, message: '连接成功' };
    }
    return { ok: false, message: `模型返回空文本（reply="${reply}"，${reply.length} 字符）` };
  } catch (e) {
    return { ok: false, message: classifyAiFailure(e, 'PROVIDER').message };
  }
}
