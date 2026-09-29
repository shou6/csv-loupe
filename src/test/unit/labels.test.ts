import * as assert from 'assert';
import { createTranslator } from '../../core/translate';
import { delimiterLabel, encodingLabel, rowCountLabel } from '../../core/view/labels';

const t = createTranslator(undefined);

suite('rowCountLabel', () => {
  test('数え終えたら、行数と列数を 3 桁区切りで出す', () => {
    assert.strictEqual(rowCountLabel(1283492, true, 14, t), '1,283,492 rows × 14 columns');
  });

  test('数えている途中は、その時点の件数に + を付け、集計中と出す', () => {
    assert.strictEqual(
      rowCountLabel(1234000, false, 3, t),
      '1,234,000+ rows (counting…) × 3 columns'
    );
  });

  test('1 行と 1 列は単数形にする', () => {
    assert.strictEqual(rowCountLabel(1, true, 1, t), '1 row × 1 column');
  });

  test('日本語に訳せる', () => {
    const ja = createTranslator({ '{0} rows': '{0} 行', '{0} columns': '{0} 列' });
    assert.strictEqual(rowCountLabel(10, true, 2, ja), '10 行 × 2 列');
  });
});

suite('encodingLabel と delimiterLabel', () => {
  test('文字コードの表示名。確信がなければ ? を付ける', () => {
    assert.strictEqual(encodingLabel('utf8', true), 'UTF-8');
    assert.strictEqual(encodingLabel('utf8bom', true), 'UTF-8 BOM');
    assert.strictEqual(encodingLabel('utf16le', false), 'UTF-16 LE?');
    assert.strictEqual(encodingLabel('utf16be', true), 'UTF-16 BE');
    assert.strictEqual(encodingLabel('shiftjis', true), 'Shift_JIS (CP932)');
  });

  test('区切り文字の表示名は翻訳する', () => {
    assert.strictEqual(delimiterLabel('tab', t), 'Tab');
    assert.strictEqual(delimiterLabel('comma', createTranslator({ Comma: 'カンマ' })), 'カンマ');
  });
});
