import { ViewPreferences } from './protocol';

/** 表示の好みの既定 */
export const DEFAULT_PREFERENCES: ViewPreferences = {
  hideEmptyValues: false,
};

/** 保存してある表示の好みを読む。無い値や型の合わない値は既定にする */
export function readPreferences(stored: unknown): ViewPreferences {
  const value = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
  return {
    hideEmptyValues:
      typeof value.hideEmptyValues === 'boolean'
        ? value.hideEmptyValues
        : DEFAULT_PREFERENCES.hideEmptyValues,
  };
}
