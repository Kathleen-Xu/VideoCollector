/**
 * YouTube 采集器
 * 实现关键词扩展、OR 搜索、分页和去重
 */

import axios from 'axios';
import { BaseCollector, SearchResult } from './base';
import { Video } from './types';
import { CommonConfig } from '../config';
import { expandKeywords } from '../expand';

// YouTube API 配置
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 7890;
const BATCH_SIZE = 50; // API 批量限制

/**
 * YouTube 搜索项类型
 */
interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    channelTitle: string;
  };
}

/**
 * YouTube 搜索响应类型
 */
interface YouTubeSearchResponse {
  items: YouTubeSearchItem[];
  nextPageToken?: string;
  pageInfo?: {
    totalResults: number;
    resultsPerPage: number;
  };
}

/**
 * YouTube 视频项类型
 */
interface YouTubeVideoItem {
  id: string;
  snippet: {
    publishedAt: string;
    channelId: string;
    channelTitle: string;
    title: string;
    description: string;
  };
  statistics: {
    viewCount?: string;
    likeCount?: string;
  };
}

/**
 * YouTube 频道项类型
 */
interface YouTubeChannelItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    customUrl?: string;
  };
  statistics: {
    subscriberCount?: string;
  };
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string;
    };
  };
}

/**
 * 账号基本信息（不含发布时间）
 */
interface AccountBasic {
  accountId: string;
  accountName: string;
  accountUrl: string;
  followers: number;
  accountBio: string;
}

/**
 * YouTube 采集器
 * 特性：
 * 1. 关键词扩展（中英文 + 预定义表 + 翻译）
 * 2. OR 搜索（一次请求返回多个关键词的结果）
 * 3. 分页支持（通过 pageToken 实现）
 * 4. 视频去重（维护已获取视频 ID 的 Set）
 * 5. 批量获取视频/账号详情并过滤
 */
export class YouTubeCollector extends BaseCollector {
  private seenVideoIds: Set<string>; // 用于去重
  private seenAccountIds: Set<string>; // 账号缓存去重
  private apiKey: string;

  constructor(keywords: string[], config: CommonConfig) {
    super(keywords, config);
    this.seenVideoIds = new Set();
    this.seenAccountIds = new Set();
    this.apiKey = process.env.YOUTUBE_API_KEY || '';

    if (!this.apiKey) {
      throw new Error('请设置 YOUTUBE_API_KEY 环境变量');
    }
  }

  /**
   * 搜索实现
   * 1. 使用关键词扩展模块获取扩展后的关键词
   * 2. 用 OR 组装后调用 YouTube API
   * 3. 支持分页，返回去重后的视频列表
   */
  protected async search(
    keywords: string[],
    pageToken: string | null,
    requestCount: number
  ): Promise<SearchResult | null> {
    try {
      // 构建扩展后的 OR 查询
      const expandedQuery = await expandKeywords(keywords);
      console.log(`  [YouTube] 搜索查询: ${expandedQuery}`);
      console.log(`  [YouTube] pageToken: ${pageToken || 'null'}, requestCount: ${requestCount}`);

      // 调用 YouTube API
      const response = await axios.get<YouTubeSearchResponse>(`${YOUTUBE_API_BASE}/search`, {
        params: {
          part: 'snippet',
          q: expandedQuery,
          type: 'video',
          maxResults: Math.min(requestCount, 50),
          pageToken: pageToken || undefined,
          key: this.apiKey,
          order: 'relevance',
        },
        timeout: 15000,
        proxy: {
          host: PROXY_HOST,
          port: PROXY_PORT,
          protocol: 'http',
        },
      });

      const data = response.data;
      const items = data.items || [];

      // 如果没有结果，返回 null 表示无更多结果
      if (items.length === 0) {
        console.log(`  [YouTube] 没有更多结果`);
        return null;
      }

      // 过滤并去重，收集新的视频
      const newVideos: Video[] = [];
      let duplicateCount = 0;

      for (const item of items) {
        const videoId = item.id.videoId;

        // 跳过已处理过的视频（YouTube 搜索结果可能重复）
        if (this.seenVideoIds.has(videoId)) {
          duplicateCount++;
          continue;
        }

        // 标记为已处理
        this.seenVideoIds.add(videoId);

        newVideos.push({
          videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          views: 0, // search API 不返回，稍后由 filterBatch 补充
          likes: 0,
          publishedAt: new Date(item.snippet.publishedAt),
          accountId: item.snippet.channelId,
          accountName: item.snippet.channelTitle,
          accountUrl: `https://www.youtube.com/channel/${item.snippet.channelId}`,
        });
      }

      if (duplicateCount > 0) {
        console.log(`  [YouTube] 过滤重复视频: ${duplicateCount} 个`);
      }
      console.log(`  [YouTube] 获取新视频: ${newVideos.length} 个`);

      // 返回结果和下一页 token
      return {
        videos: newVideos,
        nextPageToken: data.nextPageToken || null,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`  [YouTube] API 请求失败: ${error.message}`);
        if (error.response?.data?.error?.message) {
          console.error(`  [YouTube] API 错误: ${error.response.data.error.message}`);
        }
      } else {
        console.error(`  [YouTube] 搜索失败: ${error}`);
      }
      return null;
    }
  }

  /**
   * 批量过滤实现
   * 优化流程：
   * 1. 批量获取视频详情 → 过滤播放量、点赞量
   * 2. 批量获取账号基本信息 → 过滤粉丝数
   * 3. 逐个查询最近发布时间 → 满足数量后立即停止
   */
  protected async filterBatch(videos: Video[], maxCount: number): Promise<Video[]> {
    if (videos.length === 0) {
      return [];
    }

    console.log(`    [过滤] 检查 ${videos.length} 个视频，目标: ${maxCount}`);

    // 1. 批量获取视频详情
    const videoIds = videos.map(v => v.videoId);
    const videoDetails = await this.getVideoDetailsBatch(videoIds);
    const videoMap = new Map(videoDetails.map(v => [v.videoId, v]));

    // 2. 收集需要查询的账号 ID（去重）
    const accountIds = [...new Set(
      videos
        .map(v => videoMap.get(v.videoId)?.accountId || v.accountId)
        .filter(id => id && !this.seenAccountIds.has(id))
    )];

    // 3. 批量获取账号基本信息（不含发布时间）
    const accountDetails = await this.getAccountBasicBatch(accountIds);
    const accountMap = new Map(accountDetails.map(a => [a.accountId, a]));

    // 标记已查询过的账号
    accountIds.forEach(id => this.seenAccountIds.add(id));

    const { minViews, minLikes, minFollowers, maxDaysSincePublished } = this.config.filter;

    // 4. 第一轮过滤：播放量、点赞量、粉丝数
    const candidates: Video[] = [];

    for (const video of videos) {
      const details = videoMap.get(video.videoId);
      if (!details) continue;

      // 检查视频基本指标
      if (details.views < minViews) continue;
      if (details.likes < minLikes) continue;

      // 检查账号粉丝数
      const account = accountMap.get(details.accountId);
      if (!account || (account.followers || 0) < minFollowers) continue;

      candidates.push(details);
    }

    console.log(`    [过滤] 候选视频: ${candidates.length} 个，开始检查发布时间...`);

    // 5. 逐个查询发布时间，满足数量后停止
    const result: Video[] = [];

    for (const details of candidates) {
      // 满足目标数量，停止
      if (result.length >= maxCount) {
        break;
      }

      const account = accountMap.get(details.accountId);
      if (!account) continue;

      // 检查关键词匹配
      const text = (
        details.title + ' ' +
        details.description + ' ' +
        account.accountName + ' ' +
        (account.accountBio || '')
      ).toLowerCase();
      const hasKeyword = this.keywords.some(kw => text.includes(kw.toLowerCase()));
      if (!hasKeyword) {
        console.log(`    ✗ "${details.title.substring(0, 30)}...": 未命中关键词`);
        continue;
      }

      // 逐个查询最近发布时间
      const lastPublishedAt = await this.getLastPublishedTimeByChannel(account.accountId);
      if (!lastPublishedAt) {
        console.log(`    ✗ "${details.title.substring(0, 30)}...": 无法获取账号发布时间`);
        continue;
      }

      const daysSince = Math.floor((Date.now() - lastPublishedAt.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSince > maxDaysSincePublished) {
        console.log(`    ✗ "${details.title.substring(0, 30)}...": 账号 ${daysSince} 天前发布`);
        continue;
      }

      // 合并账号信息到视频对象
      const enrichedVideo = {
        ...details,
        platform: 'youtube',
        contentUrl: `https://www.youtube.com/watch?v=${details.videoId}`,
        followers: account.followers,
        accountBio: account.accountBio,
        lastPublishedAt,
      };
      result.push(enrichedVideo);
      console.log(`    ✓ "${details.title.substring(0, 40)}..." (${details.views}播放, ${account.followers}粉丝)`);
    }

    console.log(`    [过滤] 通过 ${result.length} 个视频`);
    return result;
  }

  /**
   * 批量获取视频详情
   */
  private async getVideoDetailsBatch(videoIds: string[]): Promise<Video[]> {
    if (videoIds.length === 0) return [];

    const results: Video[] = [];

    for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
      const chunk = videoIds.slice(i, i + BATCH_SIZE);

      try {
        const response = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
          params: {
            part: 'snippet,statistics',
            id: chunk.join(','),
            key: this.apiKey,
          },
          timeout: 15000,
          proxy: {
            host: PROXY_HOST,
            port: PROXY_PORT,
            protocol: 'http',
          },
        });

        const items: YouTubeVideoItem[] = response.data.items || [];

        for (const item of items) {
          results.push({
            videoId: item.id,
            title: item.snippet.title,
            description: item.snippet.description,
            views: parseInt(item.statistics.viewCount || '0', 10),
            likes: parseInt(item.statistics.likeCount || '0', 10),
            publishedAt: new Date(item.snippet.publishedAt),
            accountId: item.snippet.channelId,
            accountName: item.snippet.channelTitle,
            accountUrl: `https://www.youtube.com/channel/${item.snippet.channelId}`,
          });
        }
      } catch (error) {
        console.error(`    ✗ 获取视频详情失败: ${error}`);
      }
    }

    return results;
  }

  /**
   * 批量获取账号基本信息（不含发布时间）
   */
  private async getAccountBasicBatch(accountIds: string[]): Promise<AccountBasic[]> {
    if (accountIds.length === 0) return [];

    const results: AccountBasic[] = [];

    for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
      const chunk = accountIds.slice(i, i + BATCH_SIZE);

      try {
        const response = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
          params: {
            part: 'snippet,statistics',
            id: chunk.join(','),
            key: this.apiKey,
          },
          timeout: 15000,
          proxy: {
            host: PROXY_HOST,
            port: PROXY_PORT,
            protocol: 'http',
          },
        });

        const items: YouTubeChannelItem[] = response.data.items || [];

        for (const item of items) {
          const customUrl = item.snippet.customUrl;
          const accountUrl = customUrl
            ? `https://www.youtube.com/${customUrl}`
            : `https://www.youtube.com/channel/${item.id}`;

          results.push({
            accountId: item.id,
            accountName: item.snippet.title,
            accountUrl,
            followers: parseInt(item.statistics.subscriberCount || '0', 10),
            accountBio: item.snippet.description || '',
          });
        }
      } catch (error) {
        console.error(`    ✗ 获取账号详情失败: ${error}`);
      }
    }

    return results;
  }

  /**
   * 根据频道 ID 获取最近发布时间
   */
  private async getLastPublishedTimeByChannel(channelId: string): Promise<Date | null> {
    // 先获取频道的 uploads 播放列表 ID
    try {
      const response = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
        params: {
          part: 'contentDetails',
          id: channelId,
          key: this.apiKey,
        },
        timeout: 15000,
        proxy: {
          host: PROXY_HOST,
          port: PROXY_PORT,
          protocol: 'http',
        },
      });

      const items = response.data.items || [];
      if (items.length === 0) return null;

      const uploadsPlaylistId = items[0].contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) return null;

      return await this.getLastPublishedTime(uploadsPlaylistId);
    } catch {
      return null;
    }
  }

  /**
   * 获取播放列表最新视频发布时间
   */
  private async getLastPublishedTime(uploadsPlaylistId: string): Promise<Date | null> {
    const response = await axios.get(`${YOUTUBE_API_BASE}/playlistItems`, {
      params: {
        part: 'snippet',
        playlistId: uploadsPlaylistId,
        maxResults: 1,
        key: this.apiKey,
      },
      timeout: 10000,
      proxy: {
        host: PROXY_HOST,
        port: PROXY_PORT,
        protocol: 'http',
      },
    });

    const items = response.data.items || [];
    if (items.length > 0 && items[0].snippet?.publishedAt) {
      return new Date(items[0].snippet.publishedAt);
    }
    return null;
  }
}
