/** 将标签建议链路的内部错误转换成可操作的界面提示。 */
export function formatTagSuggestionError(message: string): string {
  const raw = message.trim();
  if (/NO_PROVIDER|未设置默认 AI Provider|默认 Provider 不存在/i.test(raw)) {
    return '请先在 AI 设置中配置并启用默认模型。';
  }
  if (/CONTENT_NOT_READY|正文尚未清洗完成/i.test(raw)) {
    return '文章正文尚未准备完成，请稍后重试。';
  }
  if (/AI_RESULT_NOT_FOUND|未找到标签建议/i.test(raw)) {
    return '生成完成后未能读取标签建议，请重试。';
  }
  if (/reasoning_content|模型返回空内容|未返回正式答案|不是有效 JSON|未生成可用的标签建议/i.test(raw)) {
    return '当前模型没有返回可用的标签建议，请重试；若仍失败，请在 AI 设置中更换模型。';
  }
  if (/HTTP\s*(401|403)|unauthori[sz]ed|api[ _-]*key/i.test(raw)) {
    return 'AI 服务拒绝了请求，请检查 API Key 和模型权限。';
  }
  if (/HTTP\s*429|rate[ _-]*limit|请求过于频繁/i.test(raw)) {
    return 'AI 服务当前请求过多，请稍后重试。';
  }
  if (/请求超时|timed?\s*out/i.test(raw)) {
    return 'AI 请求超时，请检查网络后重试。';
  }

  const withoutInternalCode = raw.replace(/^(?:[A-Z][A-Z0-9_]+:\s*)+/, '').trim();
  return withoutInternalCode || '暂时无法生成标签建议，请稍后重试。';
}
