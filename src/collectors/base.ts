/**
 * 采集器基类
 * 使用模板方法模式定义采集流程骨架
 *
 * 安全设计：
 * while (results.length < targetTotal && page < MAX_PAGES) {
 *   const batchSize = Math.min(config.batchSize, targetTotal - results.length);
 *   const result = await search(keywords, pageToken, batchSize);
 *   if (!result) break; // 无更多结果时退出
 *   pageToken = result.nextPageToken;
 *   // 过滤 videos...
 * }
 */

import { CommonConfig } from '../config';
import { Video } from './types';

/**
 * 搜索结果
 */
export interface SearchResult {
  videos: Video[];
  nextPageToken: string | null;
}

/**
 * 采集器抽象基类
 */
export abstract class BaseCollector {
  protected keywords: string[];
  protected config: CommonConfig;

  constructor(keywords: string[], config: CommonConfig) {
    this.keywords = keywords;
    this.config = config;
  }

  /**
   * 模板方法：定义采集流程骨架
   * 子类通过重写搜索和过滤方法自定义行为
   */
  async collect(): Promise<Video[]> {
    const results: Video[] = [];
    let pageToken: string | null = null;
    let iterations = 0;
    const targetTotal = this.config.targetCount;
    const batchSize = this.config.batchSize;
    const maxIterations = this.config.maxSearchIterations;

    while (results.length < targetTotal && iterations < maxIterations) {
      // 搜索（子类实现，支持分页）
      const searchResult = await this.search(this.keywords, pageToken, batchSize);

      // 返回 null 表示没有更多结果
      if (searchResult === null) {
        console.log(`  ⚠ 没有更多结果，停止`);
        break;
      }

      // 更新游标
      pageToken = searchResult.nextPageToken;

      // 如果没有下一页，停止
      if (pageToken === null && searchResult.videos.length === 0) {
        console.log(`  ⚠ 没有更多结果，停止`);
        break;
      }

      // 批量过滤（子类实现）
      const maxCount = targetTotal - results.length;
      const filtered = await this.filterBatch(searchResult.videos, maxCount);

      // 批量添加
      results.push(...filtered);
      console.log(`    ✓ 累计: ${results.length}/${targetTotal}`);

      // 如果没有下一页，停止
      if (pageToken === null) {
        console.log(`  ⚠ 已到最后一页，停止`);
        break;
      }

      iterations++;
    }

    if (iterations >= maxIterations) {
      console.log(`  ⚠ 达到最大搜索次数 ${maxIterations}，停止`);
    }

    return results;
  }

  /** 搜索：子类实现（支持分页，返回 null 表示无更多结果） */
  protected abstract search(
    keywords: string[],
    pageToken: string | null,
    requestCount: number
  ): Promise<SearchResult | null>;

  /** 批量过滤：子类实现（maxCount 表示最多返回多少视频） */
  protected abstract filterBatch(videos: Video[], maxCount: number): Promise<Video[]>;
}
