/**
 * Video Grabber v2 - 主程序入口
 */

import { getInputFromArgs } from './config';
import { createCollector } from './collectors';
import { save } from './output';

/**
 * 主函数
 */
async function main() {
  const { keywords, platforms } = getInputFromArgs();

  console.log('========================================');
  console.log('Video Grabber');
  console.log('========================================');
  console.log(`关键词: ${keywords.join(', ')}`);
  console.log(`平台: ${platforms.join(', ')}`);
  console.log('开始采集...\n');

  // 收集所有平台的视频
  const allResults: any[] = [];

  // 遍历启用的平台
  for (const platform of platforms) {
    console.log(`[平台: ${platform}]`);
    const collector = createCollector(platform, keywords);
    const results = await collector.collect();
    console.log(`  完成: ${results.length} 个视频\n`);
    allResults.push(...results);
  }

  // 保存结果
  if (allResults.length > 0) {
    save(allResults, keywords);
  }

  console.log('========================================');
  console.log('采集完成');
  console.log('========================================');
}

main().catch(err => {
  console.error('错误:', err.message);
  process.exit(1);
});
