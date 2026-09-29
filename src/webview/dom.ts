/** DOM を組み立てる小さな補助 */

type Child = Node | string | null | undefined | false;

/**
 * 表示用に前後の空白を詰めた値を、空白の印と一緒に要素の中身にする。
 * 印は、先頭や末尾に空白があったことを示す（値そのものは変えない）。
 */
export function appendTrimmed(
  parent: HTMLElement,
  display: { leading: boolean; trailing: boolean },
  text: string,
  title: string
): void {
  if (display.leading) {
    parent.append(el('span', { className: 'ws', text: '␣', title }));
  }
  parent.append(text);
  if (display.trailing) {
    parent.append(el('span', { className: 'ws', text: '␣', title }));
  }
}

export interface ElementProps {
  className?: string;
  title?: string;
  text?: string;
  attrs?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.className) {
    element.className = props.className;
  }
  if (props.title) {
    element.title = props.title;
  }
  if (props.text !== undefined) {
    element.textContent = props.text;
  }
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    element.setAttribute(name, value);
  }
  for (const [name, handler] of Object.entries(props.on ?? {})) {
    if (handler) {
      element.addEventListener(name, handler);
    }
  }
  for (const child of children) {
    if (child) {
      element.append(child);
    }
  }
  return element;
}
