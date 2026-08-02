export type AiOperation = 'PROVIDER' | 'SUMMARY' | 'TRANSLATION' | 'CHAT' | 'TAG';

export interface AiFailure {
  code: string;
  message: string;
}

/** 将不同 OpenAI-compatible Provider 的底层错误统一为可操作的中文提示。 */
export function classifyAiFailure(error: unknown, operation: AiOperation): AiFailure {
  const raw = error instanceof Error ? error.message : String(error);
  const codePrefix = `AI_${operation}`;

  if (/请求超时|\btimeout\b|timed?\s*out|AbortError/i.test(raw)) {
    return {
      code: `${codePrefix}_TIMEOUT`,
      message: 'AI 请求超时。请检查网络或系统代理后重试；长文章可以稍后再试。'
    };
  }
  if (/HTTP\s+(?:401|403)\b|unauthori[sz]ed|forbidden|invalid[ _-]*api[ _-]*key/i.test(raw)) {
    return {
      code: `${codePrefix}_AUTH_FAILED`,
      message: 'AI 服务拒绝了请求。请检查 API Key、模型名称以及账号是否有该模型的访问权限。'
    };
  }
  if (/HTTP\s+404\b|model\s+not\s+found|unknown\s+model/i.test(raw)) {
    return {
      code: `${codePrefix}_MODEL_NOT_FOUND`,
      message: '没有找到配置的 AI 模型或接口地址。请检查 Base URL 和模型名称。'
    };
  }
  if (/HTTP\s+429\b|rate[ _-]*limit|too many requests|quota/i.test(raw)) {
    return {
      code: `${codePrefix}_RATE_LIMITED`,
      message: 'AI 服务当前请求过多或额度不足。请稍后重试，并检查账号余额或调用限额。'
    };
  }
  if (/HTTP\s+5\d\d\b|service unavailable|bad gateway|gateway timeout/i.test(raw)) {
    return {
      code: `${codePrefix}_PROVIDER_UNAVAILABLE`,
      message: 'AI 服务暂时不可用。请稍后重试；若持续失败，请更换模型或 Provider。'
    };
  }
  if (/ERR_PROXY|proxy|代理/i.test(raw)) {
    return {
      code: `${codePrefix}_PROXY_FAILED`,
      message: '无法通过系统代理连接 AI 服务。请检查代理地址、认证状态或 PAC 配置。'
    };
  }
  if (/certificate|CERT_|证书|TLS|SSL/i.test(raw)) {
    return {
      code: `${codePrefix}_CERTIFICATE_FAILED`,
      message: 'AI 服务的安全证书无法验证。请检查系统时间、代理证书或服务地址。'
    };
  }
  if (/ENOTFOUND|EAI_AGAIN|NAME_NOT_RESOLVED|域名解析/i.test(raw)) {
    return {
      code: `${codePrefix}_DNS_FAILED`,
      message: '无法解析 AI 服务地址。请检查 Base URL、DNS 和网络连接。'
    };
  }
  if (/fetch failed|failed to fetch|network|ECONN(?:RESET|REFUSED)|EHOSTUNREACH|ENETUNREACH|ERR_CONNECTION/i.test(raw)) {
    return {
      code: `${codePrefix}_NETWORK_FAILED`,
      message: '无法连接 AI 服务。请检查网络、系统代理和 Provider 地址后重试。'
    };
  }
  if (/Provider API Key 未配置|API Key 无法解密/i.test(raw)) {
    return {
      code: `${codePrefix}_KEY_MISSING`,
      message: 'AI API Key 未配置或无法读取。请在 AI 设置中重新输入 API Key。'
    };
  }
  if (/模型返回空内容|未返回 choices|缺少 message|未返回正式答案/i.test(raw)) {
    return {
      code: `${codePrefix}_EMPTY_RESPONSE`,
      message: '当前模型没有返回可用内容。请重试；若仍失败，请更换模型。'
    };
  }
  if (/不是有效 JSON|invalid\s+json|json\s+parse|未生成可用/i.test(raw)) {
    return {
      code: `${codePrefix}_INVALID_RESPONSE`,
      message: '当前模型返回的格式不符合要求。请重试；若仍失败，请更换支持结构化输出的模型。'
    };
  }
  if (/HTTP\s+(?:400|422)\b|invalid\s+(?:request|parameter)/i.test(raw)) {
    return {
      code: `${codePrefix}_REQUEST_REJECTED`,
      message: 'AI 服务不接受当前请求参数。请检查模型名称和兼容性设置，或更换 Provider。'
    };
  }

  const cleaned = raw
    .replace(/^(?:Error:\s*)+/i, '')
    .replace(/^(?:[A-Z][A-Z0-9_]+:\s*)+/, '')
    .trim();
  return {
    code: `${codePrefix}_FAILED`,
    message: /[\u3400-\u9fff]/u.test(cleaned) && cleaned.length <= 180
      ? `${cleaned.replace(/[。；，,.!?！？]+$/, '')}。请稍后重试；若持续失败，请检查 AI 设置。`
      : 'AI 服务调用失败。请检查网络、Base URL、模型名称和 API Key 后重试。'
  };
}
