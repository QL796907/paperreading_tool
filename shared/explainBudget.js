/**
 * 自动释义时，POST /api/terms 会等到模型调用结束才返回。
 * explainTimeoutMs 是模型那一次的中止时间。
 * explainClientMarginMs 是中止之后服务端把已经保存的词条写回响应的尾部。
 * 插件只等 explainClientWaitMs 这一次，不要再另写一个超时，也不要失败后重试。
 */
export const explainTimeoutMs = 60 * 1000;
export const explainClientMarginMs = 5 * 1000;
export const explainClientWaitMs = explainTimeoutMs + explainClientMarginMs;
