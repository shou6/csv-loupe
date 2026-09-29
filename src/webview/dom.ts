/** DOM を組み立てる小さな補助 */

type Child = Node | string | null | undefined | false;

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
