# Video Grabber v2

视频采集工具，支持从 YouTube 搜索并采集符合条件的视频。

## 环境配置

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置 API Key

复制 `.env.example` 为 `.env`，填入 YouTube API Key：

```
YOUTUBE_API_KEY=your_youtube_api_key_here
```

获取方式：在 [Google Cloud Console](https://console.cloud.google.com/) 创建 YouTube Data API v3 项目并生成 API Key。

## 使用方法

### 基本用法

```bash
pnpm dev -- --keywords "关键词"
```

### 多关键词

```bash
pnpm dev -- --keywords "fitness,yoga,diet"
```

### 指定平台

```bash
pnpm dev -- --keywords "健身" --platforms youtube
```

### 参数说明

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--keywords` | `-k` | 搜索关键词，支持多个（逗号分隔） | 必填 |
| `--platforms` | `-p` | 目标平台，目前仅支持 youtube | youtube |

## 输出

采集结果保存至 `output/` 目录，文件名为 `results_{关键词}_{时间戳}.json`。

## 过滤条件

系统自动应用以下过滤条件：

- 播放量 > 10,000
- 点赞数 > 100
- 粉丝数 > 1,000
- 发布于 30 天内
- 单次目标采集 5 个视频（节省API调用量，可在config.ts中调整targetCount）
