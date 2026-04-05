/**
 * 关键词扩展模块
 * 功能：
 * 1. 预定义映射表（中英文同义词扩展）
 * 2. MyMemory 翻译 API（自动中英文互译）
 * 3. 输出 OR 拼接的搜索查询字符串
 */

import axios from 'axios';

// MyMemory 免费翻译 API（无需 API key）
const TRANSLATION_API = 'https://api.mymemory.translated.net/get';

// 翻译缓存
const translationCache: Map<string, string> = new Map();

// ============================================
// 预定义映射表（精简版，仅中英文）
// ============================================

const KEYWORD_TABLE: Record<string, string[]> = {
  // fitness / 健身
  'fitness': ['fitness', '健身', '体能训练', 'physical fitness'],
  'workout': ['workout', '训练', '锻炼', 'exercise', 'exercises'],
  'gym': ['gym', '健身房', 'gym workout'],
  'training': ['training', '训练', 'train'],
  'bodybuilding': ['bodybuilding', '健美'],
  'strength': ['strength', '力量', 'strength training'],
  'cardio': ['cardio', '有氧', '有氧运动'],

  // home workout / 居家训练
  'home workout': ['home workout', '居家训练', '居家健身', 'home exercise', 'home training', '在家运动', '在家锻炼'],
  'home fitness': ['home fitness', '居家健身', '家庭健身', 'home gym'],
  'bodyweight': ['bodyweight', '徒手', '徒手训练', '自重训练', '体重训练'],
  'no equipment': ['no equipment', 'no equipment workout', '无需器材', '无器械', '无需设备'],
  'beginner workout': ['beginner workout', '初学者训练', '新手训练', '入门训练', 'beginner exercise'],

  // nutrition / 营养饮食
  'nutrition': ['nutrition', '营养', '营养学', 'nutritionist', 'nutritional'],
  'healthy eating': ['healthy eating', '健康饮食', '健康食物', 'healthy food'],
  'diet': ['diet', '饮食', '节食', '减肥饮食', 'dieting', 'diet plan', '减肥餐'],
  'food': ['food', '食物', '食品', 'meal', 'recipes', 'recipe', '做饭', '烹饪'],
  'protein': ['protein', '蛋白质', '蛋白', '高蛋白'],
  'calories': ['calories', '卡路里', '热量', 'kcal'],
  'meal prep': ['meal prep', '备餐', 'meal planning', 'meal preparation', '食材准备'],
  'eating habits': ['eating habits', '饮食习惯', '健康习惯'],
  'supplements': ['supplements', '补剂', '营养补剂', '保健品'],
  'vitamins': ['vitamins', 'vitamin', '维生素', '微量元素'],
  'hydration': ['hydration', '补水', '喝水', '饮水'],

  // weight loss / 减脂
  'weight loss': ['weight loss', '减脂', '减肥', '瘦身', '燃脂', '降低体重', '甩脂', '减肥法'],
  'fat loss': ['fat loss', '减脂', '燃脂', '减掉脂肪', '脂肪燃烧'],
  'burn fat': ['burn fat', '燃脂', '燃烧脂肪', 'burning fat'],
  'slim': ['slim', 'slimming', '瘦身', '变瘦', '苗条'],
  'lean': ['lean', 'lean body', 'lean muscle', '减脂增肌'],
  'belly fat': ['belly fat', 'abdominal fat', '腹部脂肪', '腹部减脂'],
  'targeted fat loss': ['targeted fat loss', '局部减脂', '局部瘦', '塑形'],
  'body transformation': ['body transformation', '身材改变', '体型变化', '身体改造'],
  'belly': ['belly', 'abs', 'ab workout', '腹肌', '马甲线', '核心训练', '腹部'],
  'toning': ['toning', '塑形', '形体训练', '紧致', '体型塑造'],

  // 通用健身词汇
  'yoga': ['yoga', '瑜伽', '瑜伽练习'],
  'pilates': ['pilates', '普拉提', 'pilates workout'],
  'hiit': ['hiit', 'hiit workout', '高强度间歇', 'hiit训练', 'tabata'],
  'stretching': ['stretching', 'stretch', '拉伸', '柔韧性', '伸展运动'],
  'warm up': ['warm up', '热身', '准备活动'],
  'cooldown': ['cooldown', '放松', '拉伸放松'],
  'muscle': ['muscle', '肌肉'],
  'core': ['core', '核心', '核心肌群', 'core workout'],
  'flexibility': ['flexibility', '柔韧性', '灵活性'],
  'endurance': ['endurance', '耐力', '持久力'],
  'conditioning': ['conditioning', '体能', '身体素质'],
  'metabolism': ['metabolism', '新陈代谢', '代谢', 'basal metabolism'],
};

// ============================================
// 内部函数
// ============================================

/**
 * 检测关键词语言
 */
function detectLanguage(text: string): 'zh' | 'en' {
  return /[\u4e00-\u9fff]/.test(text) ? 'zh' : 'en';
}

/**
 * 查找预定义扩展列表
 */
function lookupTable(keyword: string): string[] | null {
  const normalized = keyword.toLowerCase().trim();

  // 1. 精确匹配
  if (KEYWORD_TABLE[normalized]) {
    return KEYWORD_TABLE[normalized];
  }

  // 2. 反向查找
  for (const values of Object.values(KEYWORD_TABLE)) {
    if (values.some(v => v.toLowerCase() === normalized)) {
      return values;
    }
  }

  // 3. 包含匹配
  for (const values of Object.values(KEYWORD_TABLE)) {
    if (normalized.includes(values[0].toLowerCase()) || values[0].toLowerCase().includes(normalized)) {
      return values;
    }
  }

  return null;
}

/**
 * 翻译关键词
 */
async function translate(keyword: string, from: string, to: string): Promise<string | null> {
  const cacheKey = `${keyword}:${from}:${to}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  try {
    const response = await axios.get(TRANSLATION_API, {
      params: { q: keyword, langpair: `${from}|${to}` },
      timeout: 3000,
    });
    if (response.data?.responseStatus === 200) {
      const result = response.data.responseData.translatedText;
      translationCache.set(cacheKey, result);
      console.log(`翻译成功: ${keyword} -> ${result}`);
      return result;
    }
  } catch {
    // 翻译失败
    console.error(`翻译失败: ${keyword}`);
  }
  return null;
}

/**
 * 扩展单个关键词（预定义表 + 翻译）
 */
async function expandOne(keyword: string, useTranslation: boolean): Promise<string[]> {
  // 1. 预定义表优先
  const tableResult = lookupTable(keyword);
  if (tableResult) {
    return tableResult;
  }

  // 2. 翻译 API
  if (!useTranslation) {
    return [keyword];
  }

  const lang = detectLanguage(keyword);
  const results: string[] = [keyword];

  if (lang === 'zh') {
    const en = await translate(keyword, 'zh-CN', 'en');
    if (en) results.push(en);
  } else {
    const zh = await translate(keyword, 'en', 'zh-CN');
    if (zh) results.push(zh);
  }
  console.log(`${keyword}: ${results}, ${lang}`);  

  return results;
}

// ============================================
// 对外接口
// ============================================

/**
 * 扩展关键词并返回 OR 搜索查询字符串
 * @param keywords 原始关键词列表
 * @param useTranslation 是否使用翻译 API（默认 true）
 * @returns OR 拼接的搜索查询，如 "fitness OR 健身 OR workout OR 训练"
 */
export async function expandKeywords(
  keywords: string[],
  useTranslation: boolean = true
): Promise<string> {
  const expanded: Set<string> = new Set();

  const results = await Promise.all(
    keywords.map(kw => expandOne(kw, useTranslation))
  );

  for (const list of results) {
    list.forEach(k => expanded.add(k));
  }

  return Array.from(expanded).join(' OR ');
}
