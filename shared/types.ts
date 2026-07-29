// ============================================================
// shared/types.ts — 核心领域类型定义
// Task 1.2: Shared Contracts (Phase 1)
//
// 本文件由张晨阳、张宇凡、陈冠中共同维护。
// 跨模块接口变更需要三人确认并同步更新本文件。
// ============================================================

// ---- Base & Utility ----

/** 语言代码，当前支持中文和英文 */
export type Language = 'zh' | 'en';

/**
 * ISO 8601 格式的时间戳字符串。
 * 统一使用 UTC 时区，格式：YYYY-MM-DDTHH:mm:ss.sssZ
 * （如 "2026-07-13T08:30:00.000Z"）。
 */
export type IsoTimestamp = string;

// ---- Feed（订阅源） ----

export interface Feed {
  id: string;
  /** 用户可编辑的显示名称 */
  title: string;
  /**
   * 订阅源 URL。
   * 必须为 http 或 https 协议，指向有效的 RSS/Atom/JSON Feed 端点。
   * 同一 Feed 在应用中通过 url 去重（忽略末尾 / 和 www. 前缀差异）。
   */
  url: string;
  /** 订阅源自身声明的标题（首次解析时获取） */
  siteTitle: string;
  /** 订阅源自身声明的描述 */
  description: string;
  /** 订阅源网站链接 */
  link: string;
  /** Feed 类型 */
  feedType: FeedType;
  /**
   * 用户分组名，可选。
   * 纯文本，不含路径分隔符。null 表示未分组。
   */
  groupName: string | null;
  /**
   * 自定义图标 URL，可选。
   * 优先使用 Feed 自身声明的 icon/favicon。
   * null 时前端使用默认图标。
   */
  iconUrl: string | null;
  /** 最后一次同步时间 */
  lastSyncAt: IsoTimestamp | null;
  /** 最后一次同步是否成功 */
  lastSyncSuccess: boolean;
  /** 最后一次同步的错误信息 */
  lastSyncError: string | null;
  /** 同步间隔（分钟），null 表示仅手动同步 */
  syncIntervalMin: number | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export type FeedType = 'rss' | 'atom' | 'jsonfeed';

export interface FeedCreateInput {
  /**
   * 订阅源 URL。
   * 必须为 http 或 https 协议。由后端 Feed 解析器验证可达性和格式。
   */
  url: string;
  title?: string;
  groupName?: string | null;
  syncIntervalMin?: number | null;
}

export interface FeedUpdateInput {
  title?: string;
  groupName?: string | null;
  syncIntervalMin?: number | null;
}

// ---- Article（文章） ----

export interface Article {
  id: string;
  /** 所属订阅源 ID */
  feedId: string;
  /** 文章标题 */
  title: string;
  /** 文章原始 URL */
  url: string;
  /** 作者 */
  author: string | null;
  /** 发布时间 */
  publishedAt: IsoTimestamp | null;
  /** 文章抓取时间 */
  fetchedAt: IsoTimestamp;
  /**
   * 原始 HTML 内容（Feed 中直接提供的）。
   * 来自外部，视为不可信输入。显示前必须经过安全清洗，
   * 不得直接以 innerHTML 方式插入 DOM。
   */
  rawHtml: string;
  /**
   * 原始纯文本内容（Feed 中提供的，如 JSON Feed 的 content_text）。
   * 可能为 null（部分 Feed 不提供纯文本版本）。
   */
  rawText: string | null;
  /**
   * 正文提取并安全清洗后的 Cleaned HTML。
   *
   * 生成规则：
   * - 仅保留正文区域，剔除导航、广告、侧栏、评论区等干扰内容
   * - 所有标签和属性必须通过安全清洗（白名单制），移除 script/style/iframe/object 等
   * - 保留的标签：h1-h6, p, img, a, ul/ol/li, dl/dt/dd, blockquote, pre/code,
   *   table/caption/colgroup/col/thead/tbody/tfoot/tr/th/td,
   *   em, strong, br, hr
   * - 保留的属性：img[src,alt,title], a[href,title], ol[start,reversed,type],
   *   li[value], 表格结构与可访问性属性, pre/code[class]；任务 checkbox 转为 [x]/[ ]
   * - img src 保留原始绝对 URL，不做本地化处理
   * - a href 必须为 http/https/mailto 协议，移除 javascript: 等危险协议
   * - code 标签的 class 保留（如 class="language-python"），供语法高亮使用
   * - 空段落和仅含空白字符的块级元素应在结构上保留但内容可为空
   * - null 表示尚未完成清洗或清洗失败
   */
  cleanedHtml: string | null;
  /**
   * 正文提取并安全清洗后的 Cleaned Markdown（GFM 规范）。
   *
   * 由 cleanedHtml 转换而来，是前端渲染和 AI Agent 输入的主要格式。
   *
   * 生成规则：
   * - 代码块：必须标注语言（如 ```python），无法识别语言时标注 ```text
   * - 图片：使用原始绝对 URL，格式为 ![alt](url)
   * - 表格：简单表格使用 GFM 表格语法；合并单元格或无表头表格使用已清洗的
   *   HTML 回退，避免 colspan/rowspan 数据错列
   * - 标题：保留原文层级，## → ####，h1 一般保留给文章标题（单个 #）
   * - 链接：格式为 [text](url)，保留原文链接文本，不展开裸 URL
   * - 引用：使用 > 语法，嵌套引用使用 >>
   * - 列表：普通有序列表保留 start 编号，无序列表用 -，任务列表保留 [x]/[ ]；
   *   reversed/type/li[value] 和描述列表使用已清洗的 HTML 回退
   * - 除 GFM 无法无损表达的复杂表格/列表回退外，不应出现 HTML 标签
   * - 不应出现明显非正文内容（导航文字、广告语、"相关阅读"等）
   * - 空行统一为单个 \\n\\n，行内不含 \\r
   * - null 表示尚未完成清洗或清洗失败
   */
  cleanedMarkdown: string | null;
  /** 内容清洗状态 */
  cleaningStatus: CleaningStatus;
  /** 是否已读 */
  isRead: boolean;
  /** 是否星标 */
  isStarred: boolean;
  /** 文章摘要（AI 生成后填充） */
  summary: string | null;
  /** 文章翻译（AI 生成后填充，按段落存储） */
  translatedParagraphs: TranslatedParagraph[] | null;
  /**
   * 文章唯一标识，用于去重。
   * 优先使用 Feed 中提供的 GUID（isPermaLink=false 时直接使用，
   * isPermaLink=true 时取其值），缺失 GUID 时回退为 url 的 SHA-256 前 16 位 hex。
   * 重复同步时以 guid 判断是否为同一篇文章。
   */
  guid: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export type CleaningStatus = 'pending' | 'in_progress' | 'done' | 'failed';

export interface TranslatedParagraph {
  index: number;
  original: string;
  translated: string;
}

/**
 * Phase 3.5.2（张宇凡 b53e7a2）：Cleaned HTML 顶层语义块，用于段落内翻译插槽。
 * - 顶层块级元素（<p> / <h1-6> / <pre> / <ul> / <ol> / <dl> / <blockquote> / <table> / <figure>）独立成块
 * - 行内节点（文本 / <a> / <strong> / <em> / <code> 等）合并为一个合成 <p>
 * - 代码块、表格等容器**不切内部**
 *
 * index 与 IPC paragraphs[i].index 一一对应，UI 端按 index 匹配挂 TranslationSlot。
 */
export interface HtmlBlock {
  /** 块索引（与 IPC paragraphs[i].index 对应） */
  index: number;
  /** 块的 outerHTML（含开闭 tag） */
  html: string;
  /** 块类型（tag name 大写，如 P / H2 / PRE） */
  tag: string;
}

export interface ArticleFilter {
  feedId?: string;
  isRead?: boolean;
  isStarred?: boolean;
  tagIds?: string[];
  search?: string;
  /** 分页偏移 */
  offset?: number;
  /** 分页大小 */
  limit?: number;
  /** 排序方式 */
  sortBy?: 'publishedAt' | 'fetchedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

// ---- Tag（标签） ----

export interface Tag {
  id: string;
  name: string;
  /**
   * 标签颜色，CSS 颜色字符串。
   * 支持 hex（#ff0000）、rgb()、rgba() 和 CSS 命名颜色。
   * null 表示使用默认颜色（由前端主题决定）。
   */
  color: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface TagCreateInput {
  name: string;
  color?: string | null;
}

export interface TagUpdateInput {
  name?: string;
  color?: string | null;
}

/** AI 标签建议 */
export interface TagSuggestion {
  name: string;
  confidence: number; // 0-1
  reason: string;
}

// ---- Note（笔记/摘录） ----

export interface Note {
  id: string;
  /** 所属文章 ID */
  articleId: string;
  /** 摘录的原文文本（选中文字时） */
  excerptText: string | null;
  /** 摘录在原文中的起始位置 */
  excerptOffset: number | null;
  /**
   * Markdown 笔记内容。
   *
   * 格式约束：
   * - 遵循 GFM 规范，以 Markdown 作为主要可编辑格式
   * - 用户自由编辑，不限制标题层级、代码块、列表等元素
   * - 导出时保留原始 Markdown 源码，不额外转换
   * - 内容可以为纯文本（不含任何 Markdown 语法标记）
   */
  markdownContent: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface NoteCreateInput {
  articleId: string;
  excerptText?: string | null;
  excerptOffset?: number | null;
  markdownContent: string;
}

export interface NoteUpdateInput {
  markdownContent?: string;
}

// ---- Digest（文摘） ----

export interface Digest {
  id: string;
  /**
   * 文摘名称。用户自定义，纯文本。
   * 导出时作为文件名的一部分（经 sanitize 处理，移除非法文件名字符）。
   */
  name: string;
  /** 包含的笔记 ID 列表（按排序） */
  noteIds: string[];
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface DigestCreateInput {
  name: string;
  noteIds: string[];
}

/**
 * 导出文件格式。
 * - markdown: 默认格式，可编辑，包含 YAML front matter 元数据和 Markdown 正文
 * - html: 独立 HTML 文件，内联样式和图片
 * - pdf: 通过 HTML 转换生成的 PDF
 */
export type ExportFormat = 'markdown' | 'html' | 'pdf';

// ---- Topic（专题） ----

export interface Topic {
  id: string;
  name: string;
  description: string;
  /**
   * 可选关键词，用于文章匹配。
   * 全部小写，不含标点。匹配时对文章标题和 cleanedMarkdown 做模糊匹配。
   * 空数组表示不通过关键词筛选，仅通过 AI 匹配。
   */
  keywords: string[];
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface TopicCreateInput {
  name: string;
  description: string;
  keywords?: string[];
  /**
   * 从阅读器内创建专题时用于固定关联当前文章。
   * 其余候选文章仍由本地关键词匹配补充，避免为了发现候选项调用模型。
   */
  seedArticleId?: string;
}

export interface TopicUpdateInput {
  name?: string;
  description?: string;
  keywords?: string[];
}

/** 专题内的事件分组 */
export interface EventGroup {
  id: string;
  topicId: string;
  /** 事件名称 */
  name: string;
  /** 该事件下的文章 ID 列表 */
  articleIds: string[];
  /** 事件时间范围起始 */
  startDate: IsoTimestamp | null;
  /** 事件时间范围结束 */
  endDate: IsoTimestamp | null;
}

/** 专题简报 */
export interface Briefing {
  id: string;
  topicId: string;
  /** 简报标题 */
  title: string;
  /**
   * Markdown 格式的简报内容。
   *
   * 由 AI Briefing Agent 生成，遵循 GFM 规范。
   * 结构要求：
   * - 以 # 标题开头（简报名称）
   * - 按事件/子话题分节，每节用 ## 分隔
   * - 每条结论以 [N] 标记序号（如 [1]），对应 BriefingConclusion.index
   * - 引用来源格式：[来源: 订阅源名](文章URL)，不使用裸 URL
   * - 支持比较性陈述（"A 来源认为...，而 B 来源则..."）
   * - 支持时间线标注（"截至 YYYY-MM-DD..."）
   * - 支持表格对比（列：观点/来源/时间）
   */
  content: string;
  /** 结论列表，每条结论关联原始文章 */
  conclusions: BriefingConclusion[];
  /** 简报覆盖的文章 ID 列表 */
  sourceArticleIds: string[];
  /** 生成时间 */
  generatedAt: IsoTimestamp;
  /**
   * 用户编辑后的简报内容。
   * 格式同 content，用户可自由修改。若用户从未编辑过则为 null。
   * 导出时优先使用编辑后的版本。
   */
  editedContent: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/** 简报中的单项结论，可追溯到原文 */
export interface BriefingConclusion {
  /** 结论序号 */
  index: number;
  /** 结论文本 */
  text: string;
  /** 支持该结论的文章 ID 列表 */
  supportingArticleIds: string[];
  /** 来源观点差异说明 */
  viewpointDiff: string | null;
}

/** 专题时间线条目 */
export interface TimelineEntry {
  date: IsoTimestamp;
  title: string;
  articleId: string;
  feedTitle: string;
  /**
   * 该条目相对于更早报道新增的信息。
   * 格式：简短的一句话描述，如"首次披露 XX 数据"或"回应了 YY 质疑"。
   * null 表示无新增信息（首篇报道或无法判断）。
   */
  newInformation: string | null;
}

/** 专题演化图中的发展方向。 */
export interface TopicGraphDirection {
  id: string;
  name: string;
  color: string;
  /** 该方向最早出现的时间，用于稳定排列泳道。 */
  firstSeenAt: IsoTimestamp;
}

/**
 * 专题演化图节点。一个节点代表一个事件/阶段，可能合并多篇重复或高度相似的报道。
 */
export interface TopicGraphNode {
  id: string;
  topicId: string;
  eventGroupId: string;
  title: string;
  date: IsoTimestamp;
  directionId: string;
  directionName: string;
  summary: string;
  /** 相对上一阶段最值得关注的新增信息。 */
  newInformation: string | null;
  articleIds: string[];
  sourceTitles: string[];
}

export type TopicGraphRelation = 'develops' | 'branches';

/** 专题演化图中的有向关系。 */
export interface TopicGraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relation: TopicGraphRelation;
  label: string;
}

/**
 * 按时间和发展方向组织的专题演化图。
 * 分析结果按 sourceSignature 缓存；只有专题或关联文章变化时才重建。
 */
export interface TopicGraph {
  topicId: string;
  directions: TopicGraphDirection[];
  nodes: TopicGraphNode[];
  edges: TopicGraphEdge[];
  generatedAt: IsoTimestamp;
  sourceSignature: string;
}

// ---- AI Provider（AI 模型配置） ----

export interface AIProvider {
  id: string;
  name: string;
  /**
   * API Base URL，如 https://api.openai.com/v1。
   * 必须以 http 或 https 开头，末尾 / 可选。
   * 后端在此 URL 后拼接 /chat/completions 调用 OpenAI-compatible API。
   */
  baseUrl: string;
  modelName: string;
  /** API Key 通过安全存储管理，此处不保存明文 */
  apiKeySet: boolean;
  isDefault: boolean;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface AIProviderCreateInput {
  name: string;
  baseUrl: string;
  modelName: string;
  apiKey: string;
  isDefault?: boolean;
}

export interface AIProviderUpdateInput {
  name?: string;
  baseUrl?: string;
  modelName?: string;
  apiKey?: string;
  isDefault?: boolean;
}

// ---- AI 结果 ----

/** AI 摘要结果 */
export interface AISummary {
  id: string;
  articleId: string;
  providerId: string;
  modelName: string;
  /** 摘要文本 */
  content: string;
  /** 输出语言 */
  language: Language;
  /** 详细程度 */
  detailLevel: SummaryDetailLevel;
  generatedAt: IsoTimestamp;
}

export type SummaryDetailLevel = 'brief' | 'standard' | 'detailed';

/** AI 翻译结果 */
export interface AITranslation {
  id: string;
  articleId: string;
  providerId: string;
  modelName: string;
  /** 目标语言 */
  targetLanguage: Language;
  /** 按段落对照存储 */
  paragraphs: TranslatedParagraph[];
  generatedAt: IsoTimestamp;
}

/** 文章 AI 助手的单条会话消息。system prompt 只允许由主进程生成。 */
export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 文章 AI 助手的一次回复。会话历史由 Renderer 在当前阅读会话内维护。 */
export interface AIChatReply {
  articleId: string;
  providerId: string;
  modelName: string;
  message: string;
  generatedAt: IsoTimestamp;
}

/**
 * 翻译运行期间从主进程推送到阅读器的进度事件。
 *
 * `started` 会一次性给出全部原文段落，阅读器据此立刻在每段后插入“翻译中”框；
 * 随后的 `segmentCompleted` 只替换已完成的那一段，避免等待整篇文章翻译结束。
 */
export type AITranslationProgressEvent =
  | {
      type: 'started';
      articleId: string;
      runId: string;
      paragraphs: TranslatedParagraph[];
    }
  | {
      type: 'segmentCompleted';
      articleId: string;
      runId: string;
      paragraph: TranslatedParagraph;
    }
  | {
      type: 'failed';
      articleId: string;
      runId: string;
      message: string;
    };

/** AI 标签推荐结果 */
export interface AITagSuggestion {
  id: string;
  articleId: string;
  providerId: string;
  modelName: string;
  suggestions: TagSuggestion[];
  generatedAt: IsoTimestamp;
}

// ---- Sync（同步） ----

export type SyncStage = 'fetching' | 'parsing' | 'saving' | 'completed' | 'failed';

export interface SyncStageEvent {
  stage: SyncStage;
  at: IsoTimestamp;
}

export interface SyncResult {
  /** 同步的订阅源 ID */
  feedId: string;
  /** 是否成功 */
  success: boolean;
  /**
   * 错误信息。
   * success=false 时不为 null，应为简短的技术原因描述
   * （如"DNS 解析失败"、"HTTP 429"、"Feed 解析错误：缺少 title 字段"）。
   * success=true 时必须为 null。
   */
  error: string | null;
  /** 新增文章数 */
  newArticles: number;
  /** 更新的文章数 */
  updatedArticles: number;
  /** 本次单源同步经历的阶段，按发生顺序记录 */
  stages: SyncStageEvent[];
  startedAt: IsoTimestamp;
  finishedAt: IsoTimestamp;
}

export interface SyncProgress {
  totalFeeds: number;
  completedFeeds: number;
  results: SyncResult[];
  /** 当前或最近处理的订阅源；尚未开始时为 null */
  currentFeedId: string | null;
  /** 当前阶段；完成后保留最终阶段，尚未开始时为 null */
  currentStage: SyncStageEvent | null;
}

// ---- Settings（用户设置） ----

export interface AppSettings {
  /** 界面语言 */
  language: Language;
  /** 主题 */
  theme: 'light' | 'dark' | 'system';
  /** 正文字号（px） */
  fontSize: number;
  /** 阅读区最大宽度（px） */
  readingWidth: number;
  /** 默认摘要语言 */
  defaultSummaryLanguage: Language;
  /** 默认摘要详细程度 */
  defaultSummaryDetail: SummaryDetailLevel;
  /** 默认翻译目标语言 */
  defaultTranslationTarget: Language;
  /** 默认 AI Provider ID */
  defaultProviderId: string | null;
  /**
   * 摘要 Prompt 模板（用户可覆盖）。
   * 使用 {{变量}} 占位符：{{title}}、{{content}}（cleanedMarkdown）、{{language}}、{{detailLevel}}。
   * null 时使用应用内置默认模板。
   */
  summaryPromptTemplate: string | null;
  /**
   * 翻译 Prompt 模板（用户可覆盖）。
   * 使用 {{变量}} 占位符：{{title}}、{{content}}（cleanedMarkdown）、{{targetLanguage}}。
   * null 时使用应用内置默认模板。
   */
  translationPromptTemplate: string | null;
  /**
   * 标签推荐 Prompt 模板（用户可覆盖）。
   * 使用 {{变量}} 占位符：{{title}}、{{content}}（cleanedMarkdown）。
   * null 时使用应用内置默认模板。
   */
  tagPromptTemplate: string | null;
  /** 字体主题 ID（指向预设字体方案，默认 "default"） */
  fontTheme: string;
  /** 视觉主题（"classic" 白色简约 / "paper" 暖黄护眼） */
  visualTheme: 'classic' | 'paper';
  /** 侧栏宽度百分比（10-40），默认 18 */
  sidebarPercent: number;
  /** 文章列表宽度百分比（15-50），默认 28 */
  listPercent: number;
  /**
   * 系统字号（px），控制左栏（FeedList）和中栏（ArticleList）的文字大小。
   * 与 fontSize（正文字号）独立，仅影响 UI 面板，不影响阅读区正文。
   * 范围 10–24，默认 14。
   */
  systemFontSize: number;
  /**
   * 左栏（订阅源侧栏）是否可见。
   * false 时侧栏隐藏，中栏和右栏自动扩展填充空间。
   * 默认 true。
   */
  sidebarVisible: boolean;
  /**
   * 新手引导是否已完成。
   * false 时首次启动自动触发引导；用户完成或跳过引导后设为 true。
   * 默认 false（即首次启动触发引导）。
   */
  onboardingCompleted: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'zh',
  theme: 'system',
  fontSize: 16,
  readingWidth: 800,
  defaultSummaryLanguage: 'zh',
  defaultSummaryDetail: 'standard',
  defaultTranslationTarget: 'zh',
  defaultProviderId: null,
  summaryPromptTemplate: null,
  translationPromptTemplate: null,
  tagPromptTemplate: null,
  fontTheme: 'default',
  visualTheme: 'classic',
  sidebarPercent: 18,
  listPercent: 28,
  systemFontSize: 14,
  sidebarVisible: true,
  onboardingCompleted: false,
};

// ---- Log（日志） ----

export interface LogEntry {
  id: string;
  /**
   * 日志级别。
   * - debug: 开发调试信息（生产环境默认不记录）
   * - info: 正常运维事件（同步开始/完成、文件导入等）
   * - warn: 非致命异常（单条 Feed 解析失败但整体同步继续等）
   * - error: 需要关注的问题（数据库写入失败、AI 调用错误等）
   */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** 来源模块，格式为 area:component，如 "sync:rssFetcher"、"db:articleRepo" */
  module: string;
  message: string;
  /**
   * 附加上下文数据，格式为 JSON 字符串。
   * 已脱敏处理，不得包含 API Key、用户路径、文章全文。
   * 典型用途：记录被影响的 ID 列表、请求耗时、HTTP 状态码等。
   * null 表示无附加数据。
   */
  detail: string | null;
  timestamp: IsoTimestamp;
}

// ---- OPML ----

export interface OpmlImportResult {
  feedsImported: number;
  feedsSkipped: number;
  errors: string[];
}
