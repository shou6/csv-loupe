/** 配色のテーマ。設定 csvLoupe.colorTheme の値と同じ */
export const COLOR_THEMES = ['purple', 'teal', 'vscode'] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number];

export const DEFAULT_COLOR_THEME: ColorTheme = 'purple';

/** 設定の値 → テーマ。知らない値は既定にする */
export function colorThemeFromSetting(value: unknown): ColorTheme {
  return COLOR_THEMES.find((theme) => theme === value) ?? DEFAULT_COLOR_THEME;
}
