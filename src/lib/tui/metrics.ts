export const renderMetrics = { enabled: false };
export function recordTextHelper<T>(_label: string, fn: () => T): T { return fn(); }
