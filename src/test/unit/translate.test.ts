import * as assert from 'assert';
import { createTranslator } from '../../core/translate';

suite('createTranslator', () => {
  test('翻訳が無ければ、英語のまま差し込みだけを行う', () => {
    const t = createTranslator(undefined);
    assert.strictEqual(t('Row {0} of {1}', '5', '10'), 'Row 5 of 10');
  });

  test('翻訳があれば、訳文に差し込む', () => {
    const t = createTranslator({ 'Row {0} of {1}': '{1} 行中 {0} 行目' });
    assert.strictEqual(t('Row {0} of {1}', '5', '10'), '10 行中 5 行目');
  });

  test('翻訳に無い文字列は英語のまま', () => {
    const t = createTranslator({ Other: 'ほか' });
    assert.strictEqual(t('Find'), 'Find');
  });

  test('引数が足りない差し込み位置は空にする', () => {
    assert.strictEqual(createTranslator(undefined)('{0}-{1}', 'a'), 'a-');
  });
});
