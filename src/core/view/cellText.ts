export interface DisplayText {
  /** 前後の空白を詰めた値 */
  text: string;
  /** 先頭に空白があった */
  leading: boolean;
  /** 末尾に空白があった */
  trailing: boolean;
}

/** 空白として扱う文字。半角の空白、タブ、全角の空白 */
const LEADING = /^[ \t　]+/;
const TRAILING = /[ \t　]+$/;

/**
 * 表示用に、値の前後の空白を詰める。空白があったことは印で示すため、どちらにあったかも返す。
 * コピーや検索には元の値を使う。
 */
export function trimForDisplay(value: string): DisplayText {
  const leading = LEADING.exec(value);
  if (leading && leading[0].length === value.length) {
    return { text: '', leading: true, trailing: false };
  }
  const trailing = TRAILING.exec(value);
  return {
    text: value.slice(leading ? leading[0].length : 0, trailing ? trailing.index : value.length),
    leading: leading !== null,
    trailing: trailing !== null,
  };
}
