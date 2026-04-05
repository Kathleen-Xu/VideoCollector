/**
 * 输出模块
 * 将采集结果保存到 output 文件夹
 */

import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = 'output';

// 确保目录存在
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// 获取北京时间字符串
function getBeijingTime(): string {
  // 北京时间 = UTC + 8
  const now = new Date();
  const beijingOffset = 8 * 60; // 8小时
  const localOffset = now.getTimezoneOffset();
  const beijingTime = new Date(now.getTime() + (localOffset + beijingOffset) * 60 * 1000);
  return beijingTime.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * 保存采集结果
 * @param videos 视频列表
 * @param keywords 关键词列表
 */
export function save(videos: any[], keywords: string[]): void {
  // 格式化输出
  const output = {
    timestamp: new Date().toISOString(),
    summary: {
      keywords,
      actual: videos.length,
    },
    videos: videos.map(v => ({
      platform: v.platform,
      account_name: v.accountName,
      account_bio: v.accountBio || '',
      account_url: v.accountUrl,
      content_title: v.title,
      content_desc: v.description,
      content_url: v.contentUrl,
      followers: v.followers || 0,
      views: v.views,
      likes: v.likes,
      published_at: v.publishedAt?.toISOString() || new Date().toISOString(),
      account_last_published_at: v.lastPublishedAt?.toISOString() || new Date().toISOString(),
    })),
  };

  // 生成文件名（北京时间）
  const timestamp = getBeijingTime();
  const keywordStr = keywords.slice(0, 2).join('_');
  const filename = `results_${keywordStr}_${timestamp}.json`;

  // 确保目录存在
  ensureDir(OUTPUT_DIR);

  // 保存文件
  const outputPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`结果已保存到: ${outputPath}`);
}
