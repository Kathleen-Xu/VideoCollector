/**
 * 配置模块
 * 提供命令行参数解析和通用配置
 */

import { config } from 'dotenv';

// 加载环境变量
config();

export enum Platform {
  YouTube = 'youtube'
  // 未来支持更多平台
}
/**
 * 通用配置接口
 */
export interface CommonConfig {
  // 过滤参数
  filter: {
    minViews: number;
    minLikes: number;
    minFollowers: number;
    maxDaysSincePublished: number;
  };
  // 目标数量
  targetCount: number;
  // 单次请求数量
  batchSize: number;
  // 最大搜索次数（兜底，防止死循环）
  maxSearchIterations: number;
}

/**
 * 命令行输入参数接口
 */
export interface CliInput {
  keywords: string[];
  platforms: Platform[];
}

/**
 * 获取命令行输入参数
 * @returns 关键词和平台数组
 */
export function getInputFromArgs(): CliInput {
  const args = process.argv.slice(2);
  const keywordsStr = getArg(args, ['--keywords', '-k']);

  if (!keywordsStr || keywordsStr.trim() === '') {
    console.error('错误: 必须提供 --keywords 参数');
    console.error('使用方法: npm run dev -- --keywords "关键词1,关键词2"');
    process.exit(1);
  }

  const keywords = keywordsStr.split(',').map(k => k.trim()).filter(k => k);
  if (keywords.length === 0) {
    console.error('错误: --keywords 参数不能为空');
    process.exit(1);
  }

  const platformsStr = getArg(args, ['--platforms', '-p']);
  let platforms: Platform[] = [Platform.YouTube];

  if (platformsStr) {
    platforms = platformsStr.split(',').map(p => p.trim().toLowerCase() as Platform);
    for (const p of platforms) {
      if (!Object.values(Platform).includes(p)) {
        console.error(`错误: 未知平台 "${p}"`);
        console.error('可用平台: youtube');
        process.exit(1);
      }
    }
  }

  return { keywords, platforms };
}

/**
 * 获取通用配置
 */
export function getCommonConfig(): CommonConfig {
  return {
    filter: {
      minViews: 10000,
      minLikes: 100,
      minFollowers: 1000,
      maxDaysSincePublished: 30,
    },
    targetCount: 5,
    batchSize: 50,
    maxSearchIterations: 20,
  };
}

function getArg(args: string[], flags: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (flags.includes(args[i]) && args[i + 1]) {
      return args[i + 1];
    }
  }
  return undefined;
}
