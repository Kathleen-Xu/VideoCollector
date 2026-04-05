# VideoGrabber 设计文档

## 1. 平台选择：YouTube

YouTube 提供官方 YouTube Data API v3（免费额度10,000单位/天），提供完整的搜索、视频、频道接口，支持按关键词检索、获取播放量/点赞量等指标，不涉及爬虫等不稳定因素，能够帮助聚焦核心逻辑开发和技术可行性验证。

若后续需覆盖抖音、小红书等国内平台，将采用"商业API优先+合规采购"策略，当前阶段选择 YouTube 以确保原型快速验证。

## 2. 技术方案

### 2.1 技术栈

- **Runtime**: Node.js + TypeScript
- **HTTP Client**: axios（统一封装代理、超时配置）
- **API**: YouTube Data API v3
- **配置管理**: .env + dotenv

### 2.2 架构设计：模块职责分离

```
src/
├── main.ts        // 主入口：命令行解析 -> 创建采集器 -> 保存结果
├── config.ts      // 配置模块：命令行参数解析 + 通用配置
├── expand.ts      // 关键词扩展：预定义表 + 翻译API
├── output.ts      // 输出模块：序列化 + 保存JSON文件
└── collectors/
    ├── base.ts    // 采集器基类：模板方法模式，定义采集流程骨架
    ├── index.ts   // 采集器工厂：根据平台创建对应采集器
    ├── types.ts   // 类型定义：Video 接口
    └── youtube.ts  // YouTube采集器：搜索、分页、过滤实现
```

**模块职责**：

| 模块 | 职责 |
|------|------|
| main.ts | 入口，协调流程 |
| config.ts | 命令行参数解析（--keywords, --platforms）和过滤配置 |
| expand.ts | 关键词扩展（预定义表 + 翻译API） |
| output.ts | 结果序列化（字段映射）+ 保存到 output/ 目录 |
| collectors/ | 采集器实现，支持多平台扩展 |

### 2.3 采集器设计：模板方法模式

**BaseCollector（抽象基类）**：

```
BaseCollector
├── collect()         // 模板方法，定义采集流程骨架
├── search()          // 抽象方法，子类实现搜索逻辑
└── filterBatch()     // 抽象方法，子类实现过滤逻辑
```

**流程骨架**（collect 方法）：

```
while (results.length < targetTotal && iterations < maxIterations) {
  1. search() -> 获取一页视频
  2. filterBatch() -> 过滤得到候选视频
  3. results.push(...candidates)
  4. 更新 pageToken，继续下一页
}
```

**YouTubeCollector（具体实现）**：

```
YouTubeCollector
├── search()      // 调用 YouTube Search API，支持分页
└── filterBatch()  // 五阶段过滤：批量获取详情 -> 批量获取账号 -> 播放量/点赞量/粉丝数过滤 -> 关键词匹配 -> 逐个查询发布时间
```

使用模板方法模式将"采集流程"与"平台实现"分离，便于后续扩展其他平台。

## 3. 关键决策与问题解决

### 3.1 关键词模糊匹配

**问题**：YouTube Search API 支持的搜索匹配机制是什么？能否实现跨语言的模糊匹配？

**分析**：YouTube 搜索机制为"精确匹配 + 智能纠错 + 前缀补全"，不支持模糊匹配。用户期望的"fitness"包含"fitness"、"home fitness"、"fitness at home"等变体，单纯依赖搜索 API 无法覆盖。

**决策**：引入 `expand.ts` 关键词扩展模块，采用"预定义表 + 翻译 API"双层策略：

```
扩展流程：
1. 预定义表优先：fitness -> [fitness, 健身, 体能训练, physical fitness]
2. 翻译 API 兜底：未知词 -> 调用 MyMemory API 中英互译
```

- 输入：用户提供的关键词（如 "fitness"）
- 输出：多语言扩展（`fitness OR 健身 OR 家庭健身 OR ...`）

**原型测试做法**：使用 MyMemory 免费翻译 API（无需 API key）对预定义表之外的关键词进行中英互译。如 "diet" -> "饮食"。

**生产环境建议**：
- 方案A：扩充预定义表覆盖更多关键词
- 方案B：接入 DashScope/Qwen 等大模型服务，生成同义词或关键词的翻译
- 方案C：使用 Embedding 模型做语义匹配，直接搜索语义相近的内容

### 3.2 筛选链路优化

**目标**：避免多余的 API 调用，同时防止搜索结果达不到目标数量时无限循环。

**决策**：采用多阶段过滤策略，前置阶段使用批量接口，后置阶段逐个查询。

```
filterBatch 流程：
1. 批量获取视频详情（video API，支持批量）
2. 批量获取账号基本信息（channel API，支持批量）
3. 第一轮过滤：播放量 > 1000，点赞量 > 100，粉丝数 > 10000（基于已有数据）
4. 关键词命中：账号名/描述 + 视频标题/描述（基于已有数据）
5. 逐个查询发布时间（playlistItems API），满足数量后停止
```

前置阶段使用批量接口，后置阶段（发布时间查询）使用逐个查询以尽早终止。

防死循环：`maxIterations = 10` 限制最大分页次数，`batchSize = 50` 限制每次请求量，`targetCount` 达标后提前退出。

## 4. 扩展到全部平台的设计思路

### 抽象层设计

```
IVideoCollector 接口
├── collect(): Promise<Video[]>
├── search(keywords, pageToken): Promise<SearchResult>
└── filterBatch(videos, maxCount): Promise<Video[]>

实现类：
├── YouTubeCollector
├── TikTokCollector
├── DouyinCollector
└── XiaohongshuCollector
```

### 工厂模式统一创建

```typescript
function createCollector(platform: string, keywords: string[]): IVideoCollector {
  switch (platform) {
    case 'youtube': return new YouTubeCollector(keywords, config);
    case 'tiktok': return new TikTokCollector(keywords, config);
    // ...
  }
}
```

### 统一数据模型

定义跨平台的统一 `Video` 接口，各平台采集器负责将自身数据映射到统一格式：

```typescript
interface Video {
  videoId: string;
  title: string;
  description: string;
  views: number;
  likes: number;
  publishedAt: Date;
  accountId: string;
  accountName: string;
  accountUrl: string;
  // 以下字段由 filterBatch 补充
  followers?: number;
  accountBio?: string;
  lastPublishedAt?: Date;
}
```

### 配置扩展（配置较多时考虑）

通过 `config.ts` 统一管理各平台的 API 配置：

```typescript
interface PlatformConfig {
  youtube: YouTubeConfig;
  tiktok: TikTokConfig;
  douyin: DouyinConfig;
  // ...
}
```

