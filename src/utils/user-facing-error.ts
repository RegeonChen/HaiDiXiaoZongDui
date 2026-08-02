export type UserAction =
  | 'general'
  | 'load'
  | 'save'
  | 'delete'
  | 'sync'
  | 'feed'
  | 'opml-import'
  | 'opml-export'
  | 'ai';

interface ErrorLike {
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
}

/**
 * 把 IPC、网络、文件系统和 Provider 的错误统一转换为中文用户提示。
 * 内部错误码仍保留在 Main 进程日志中，但不会直接显示在界面上。
 */
export function formatUserFacingError(error: unknown, action: UserAction = 'general'): string {
  const normalized = normalizeError(error);
  const code = normalized.code.toUpperCase();
  const message = normalized.message;
  const signal = `${code} ${message}`;

  if (/NO_PROVIDER|AI_.*KEY_MISSING|API Key 未配置|API Key 无法解密/i.test(signal)) {
    return '尚未配置可用的 AI 模型。请在“设置 → AI”中填写 Base URL、模型名称和 API Key，并设为默认。';
  }
  if (/CONTENT_NOT_READY|正文尚未清洗完成/i.test(signal)) {
    return '文章正文尚未准备完成。请先打开文章并等待正文加载完成，然后重试。';
  }
  if (/AI_.*AUTH_FAILED|HTTP\s*(?:401|403)|unauthori[sz]ed|forbidden|invalid[ _-]*api[ _-]*key/i.test(signal)) {
    return 'AI 服务拒绝了请求。请检查 API Key、模型名称以及账号是否有该模型的访问权限。';
  }
  if (/AI_.*MODEL_NOT_FOUND|HTTP\s*404.*(?:model|AI)|model\s+not\s+found|unknown\s+model/i.test(signal)) {
    return '没有找到配置的 AI 模型或接口地址。请检查 Base URL 和模型名称。';
  }
  if (/AI_.*RATE_LIMITED|HTTP\s*429|rate[ _-]*limit|too many requests|quota/i.test(signal)) {
    return 'AI 服务当前请求过多或额度不足。请稍后重试，并检查账号余额或调用限额。';
  }
  if (/AI_.*PROVIDER_UNAVAILABLE|HTTP\s*5\d\d|service unavailable|bad gateway/i.test(signal)) {
    return 'AI 服务暂时不可用。请稍后重试；若持续失败，请更换模型或 Provider。';
  }
  if (/AI_.*(?:EMPTY_RESPONSE|INVALID_RESPONSE)|模型返回空内容|不是有效 JSON|未生成可用/i.test(signal)) {
    return '当前模型没有返回可用结果。请重试；若仍失败，请更换支持该功能的模型。';
  }
  if (/AI_.*TIMEOUT|请求超时.*AI|AI.*请求超时/i.test(signal)) {
    return 'AI 请求超时。请检查网络或系统代理后重试；长文章可以稍后再试。';
  }
  if (/AI_.*PROXY_FAILED/i.test(signal)) {
    return '无法通过系统代理连接 AI 服务。请检查代理地址、认证状态或 PAC 配置。';
  }
  if (/AI_.*CERTIFICATE_FAILED/i.test(signal)) {
    return 'AI 服务的安全证书无法验证。请检查系统时间、代理证书或服务地址。';
  }
  if (/AI_.*DNS_FAILED/i.test(signal)) {
    return '无法解析 AI 服务地址。请检查 Base URL、DNS 和网络连接。';
  }
  if (/AI_.*NETWORK_FAILED/i.test(signal)) {
    return '无法连接 AI 服务。请检查网络、系统代理和 Provider 地址后重试。';
  }

  if (/HTTP_TIMEOUT|请求超时|ETIMEDOUT|ERR_TIMED_OUT/i.test(signal)) {
    return withTarget(message, '连接订阅服务器超时', '请检查网络或系统代理后重试。');
  }
  if (/代理服务器连接失败|代理隧道连接失败|ERR_PROXY|ERR_TUNNEL/i.test(signal)) {
    return '无法通过系统代理连接订阅服务器。请检查代理地址、认证状态或 PAC 配置。';
  }
  if (/域名解析失败|ENOTFOUND|EAI_AGAIN|NAME_NOT_RESOLVED/i.test(signal)) {
    return withTarget(message, '无法解析订阅服务器地址', '请检查订阅地址、DNS 和网络连接。');
  }
  if (/证书|CERT_|TLS|SSL/i.test(signal)) {
    return '订阅服务器的安全证书无法验证。请检查系统时间、代理证书，或确认订阅地址可信。';
  }
  if (/连接被拒绝|ECONNREFUSED|CONNECTION_REFUSED/i.test(signal)) {
    return withTarget(message, '订阅服务器拒绝了连接', '服务器可能暂时离线，请稍后重试。');
  }
  if (/连接被重置|ECONNRESET|CONNECTION_RESET/i.test(signal)) {
    return withTarget(message, '连接被订阅服务器中断', '请检查网络后重试。');
  }
  if (/HTTP_BAD_STATUS|请求返回 HTTP\s*\d+/i.test(signal)) {
    const detail = message.match(/HTTP\s*\d+(?:[^。；\n]*)?/i)?.[0];
    return `订阅服务器返回了异常状态${detail ? `（${detail}）` : ''}。请确认订阅地址仍然有效，或稍后重试。`;
  }
  if (/HTTP_BODY_TOO_LARGE|响应内容超过/i.test(signal)) {
    return '订阅内容超过安全大小限制，应用未继续下载。请改用该网站提供的精简 RSS/Atom 地址。';
  }
  if (/FEED_EMPTY/i.test(signal)) {
    return '订阅地址没有返回任何内容。请确认地址正确，或稍后重试。';
  }
  if (/FEED_PARSE_FAILED|FEED_UNSUPPORTED|无法识别 Feed|RSS\/Atom 解析失败/i.test(signal)) {
    return '返回内容不是可识别的 RSS、Atom 或 JSON Feed。请确认填写的是订阅地址，而不是普通网页地址。';
  }
  if (/URL_PROTOCOL_UNSUPPORTED/i.test(signal)) {
    return '地址协议不受支持。订阅地址只能使用 http 或 https。';
  }
  if (/URL_INVALID|URL 格式无效/i.test(signal)) {
    return '地址格式无效。请粘贴完整的 http 或 https 订阅地址。';
  }

  if (/OPML_TOO_LARGE/i.test(signal)) {
    return '所选 OPML 文件超过 5 MB，无法导入。请拆分文件后重试。';
  }
  if (/OPML_NOT_FILE/i.test(signal)) {
    return '所选项目不是可读取的 OPML 文件。请重新选择扩展名为 .opml 或 .xml 的文件。';
  }
  if (/OPML_PARSE_FAILED|OPML XML 解析失败|缺少 OPML|缺少 body/i.test(signal)) {
    return '无法识别该 OPML 文件。文件可能已损坏，或不是标准 OPML；请从原阅读器重新导出后再试。';
  }
  if (/ENOSPC|no space left|磁盘空间/i.test(signal)) {
    return '磁盘空间不足，无法完成写入。请释放空间后重试。';
  }
  if (/EACCES|EPERM|permission denied|权限/i.test(signal)) {
    return action === 'opml-export'
      ? '无法写入所选位置。请选择有写入权限的文件夹，或更换文件名后重试。'
      : '应用没有完成该操作所需的文件权限。请更换文件或保存位置后重试。';
  }
  if (/OPML_EXPORT_FAILED/i.test(signal)) {
    return 'OPML 导出失败。请确认保存位置可写、磁盘空间充足，然后重试。';
  }

  if (/NOT_FOUND/i.test(code) || /不存在|未找到/i.test(message)) {
    return `${cleanMessage(message) || '目标数据已经不存在'}。请刷新当前页面后重试。`;
  }
  if (/VALIDATION_ERROR|INVALID_PARAMS/i.test(code)) {
    return `${cleanMessage(message) || '提交的数据不完整或格式不正确'}。请检查填写内容后重试。`;
  }
  if (/SQLITE|DATABASE|数据库未初始化/i.test(signal)) {
    return '本地数据暂时无法读写。请重启应用后重试；若仍失败，请保留数据文件并联系开发者。';
  }

  const cleaned = cleanMessage(message);
  if (cleaned && /[\u3400-\u9fff]/u.test(cleaned)) {
    if (/请|检查|重试|稍后|确认|重新|无法撤销/.test(cleaned)) return punctuate(cleaned);
    return `${punctuate(cleaned)}${ACTION_GUIDANCE[action]}`;
  }
  return FALLBACKS[action];
}

const ACTION_GUIDANCE: Record<UserAction, string> = {
  general: '请稍后重试。',
  load: '请刷新当前页面后重试。',
  save: '请检查填写内容后重试。',
  delete: '请刷新当前页面后重试。',
  sync: '请检查订阅地址和网络后重试。',
  feed: '请检查订阅地址后重试。',
  'opml-import': '请重新选择文件后重试。',
  'opml-export': '请更换保存位置后重试。',
  ai: '请检查 AI 设置和网络后重试。'
};

const FALLBACKS: Record<UserAction, string> = {
  general: '操作未完成。请稍后重试。',
  load: '数据加载失败。请刷新当前页面后重试。',
  save: '保存失败。请检查填写内容后重试。',
  delete: '删除失败。请刷新当前页面后重试。',
  sync: '同步失败。请检查订阅地址、网络和系统代理后重试。',
  feed: '订阅源操作失败。请检查订阅地址后重试。',
  'opml-import': 'OPML 导入失败。请确认文件格式正确后重试。',
  'opml-export': 'OPML 导出失败。请确认保存位置可写后重试。',
  ai: 'AI 操作失败。请检查网络、模型配置和 API Key 后重试。'
};

function normalizeError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) return splitCode(error.message);
  if (typeof error === 'string') return splitCode(error);
  if (error && typeof error === 'object') {
    const value = error as ErrorLike;
    if (value.error) {
      return {
        code: value.error.code ?? '',
        message: value.error.message ?? ''
      };
    }
    return { code: value.code ?? '', message: value.message ?? '' };
  }
  return { code: '', message: '' };
}

function splitCode(value: string): { code: string; message: string } {
  const raw = value.trim();
  const bracket = raw.match(/^\[([A-Z][A-Z0-9_]+)]\s*(.*)$/s);
  if (bracket) return { code: bracket[1], message: bracket[2] };
  const colon = raw.match(/^(?:Error:\s*)?([A-Z][A-Z0-9_]+):\s*(.*)$/s);
  if (colon) return { code: colon[1], message: colon[2] };
  return { code: '', message: raw };
}

function cleanMessage(value: string): string {
  return value
    .replace(/^(?:Error:\s*)+/i, '')
    .replace(/^(?:[A-Z][A-Z0-9_]+:\s*)+/, '')
    .trim()
    .replace(/[。；，,.!?！？]+$/, '');
}

function punctuate(value: string): string {
  const trimmed = value.trim();
  return /[。！？!?]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

function withTarget(message: string, summary: string, guidance: string): string {
  const target = message.match(/[：:]\s*([^（）\n]+)(?:（|$)/)?.[1]?.trim();
  return `${summary}${target ? `（${target}）` : ''}。${guidance}`;
}
