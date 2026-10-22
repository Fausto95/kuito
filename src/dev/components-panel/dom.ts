// Elements for the Components panel, built as data: a tag, its attributes and
// listeners, and its children.

type Child = Node | string | null | false;

interface Attributes {
  class?: string;
  title?: string;
  value?: string;
  placeholder?: string;
  'aria-pressed'?: string;
  style?: string;
  onclick?: (event: MouseEvent) => void;
  onmouseenter?: () => void;
  onmouseleave?: () => void;
  onkeydown?: (event: KeyboardEvent) => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  Object.entries(attributes).forEach(([name, value]) => {
    if (typeof value === 'function') element.addEventListener(name.slice(2), value as never);
    else if (name === 'value' && element instanceof HTMLInputElement) element.value = value;
    else element.setAttribute(name, value);
  });

  children.forEach((child) => {
    if (child !== null && child !== false) element.append(child);
  });

  return element;
}
