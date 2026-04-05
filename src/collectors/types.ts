/**
 * 视频类型定义
 */

export interface Video {
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
