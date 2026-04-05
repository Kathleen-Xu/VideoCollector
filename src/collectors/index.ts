/**
 * 采集器模块
 */

import { Platform, getCommonConfig } from '../config';
import { BaseCollector } from './base';
import { YouTubeCollector } from './youtube';

export { BaseCollector } from './base';
export { YouTubeCollector } from './youtube';

/**
 * 采集器工厂函数
 */
export function createCollector(platform: Platform, keywords: string[]): BaseCollector {
  const config = getCommonConfig();

  switch (platform) {
    case Platform.YouTube:
      return new YouTubeCollector(keywords, config);
    default:
      throw new Error(`未知平台: ${platform}`);
  }
}
