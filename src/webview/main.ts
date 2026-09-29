import { createTranslator } from '../core/translate';
import { onHostMessage, post } from './vscodeApi';

const app = document.getElementById('app') as HTMLElement;
let t = createTranslator(undefined);

app.textContent = t('Loading…');

onHostMessage((message) => {
  if (message.type === 'init') {
    t = createTranslator(message.l10n);
  }
});

post({ type: 'ready' });
