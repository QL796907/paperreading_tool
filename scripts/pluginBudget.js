import {
  explainClientMarginMs,
  explainClientWaitMs,
  explainTimeoutMs,
} from "../shared/explainBudget.js";

// Zotero 的 loadSubScript 跑不了 ESM。插件目录里的 explainBudget.js 只能是这份文本。
export function pluginBudgetSource() {
  return `// 数字来自 shared/explainBudget.js。不要在这里改。
var PaperGlossaryBudget = {
  explainTimeoutMs: ${explainTimeoutMs},
  explainClientMarginMs: ${explainClientMarginMs},
  explainClientWaitMs: ${explainClientWaitMs},
};
`;
}
