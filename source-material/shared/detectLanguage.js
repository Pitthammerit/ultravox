const DE_PATTERN = /\b(und|oder|nicht|aber|der|die|das|ein|eine|ist|sind|für|mit|von|auf|bei|sich)\b/gi;
const EN_PATTERN = /\b(and|or|not|but|the|is|are|for|with|of|on|at|this|that|these|those)\b/gi;

export function detectLanguage(text) {
  if (!text) return 'en';
  const sample = String(text).slice(0, 4000).toLowerCase();
  const deUmlauts = (sample.match(/[äöüß]/g) || []).length;
  const deWords = (sample.match(DE_PATTERN) || []).length;
  const enWords = (sample.match(EN_PATTERN) || []).length;
  if (deUmlauts + deWords > enWords + 5) return 'de';
  if (enWords > deWords + 5) return 'en';
  return 'mixed';
}
