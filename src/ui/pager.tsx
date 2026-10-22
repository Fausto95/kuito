/**
 * A row of pages the user swipes through one at a time (docs/pager.md): a
 * HorizontalScroll that pages, whose pages are each as large as it. The
 * scroll view knows its width, the pager doesn't: it asks for a page, and
 * learns the page from where the view comes to rest.
 */
import type { KuitoNode } from './jsx';
import { Box, Scroll, type BoxProps, type ScrollProps } from './primitives';
import { onMount, watch, type Signal } from './reactivity';
import type { ScrollEndEvent } from './events';
import type { ScrollHandle } from './refs';

/**
 * Props of `Pager`: the page shown, the user's page changes, and a Scroll's
 * other props.
 */
export interface PagerProps extends Omit<
  ScrollProps,
  'horizontal' | 'paging' | 'snapOffsets' | 'ref' | 'onScrollEnd' | 'children'
> {
  /**
   * The page shown, from 0; the first by default. Two-way when given a
   * signal: the pager writes it as the user pages.
   */
  page?: number | Signal<number>;
  /** The page the user paged to; the app's own `page` reports none. */
  onPageChange?: (page: number) => void;
  /** Its pages, each a `Page`. */
  children?: KuitoNode;
}

/** Props of `Page`: a Box's. */
export interface PageProps extends BoxProps {}

const isSignal = (page: number | Signal<number> | undefined): page is Signal<number> =>
  typeof page === 'object' && page !== null;

/** A row of pages the user swipes through one at a time, each a `Page` as large as the pager. */
export function Pager(props: PagerProps): KuitoNode {
  const { page, onPageChange, children, ...rest } = props;

  if (!globalThis.__kuito) throw new Error('Pager must render inside a Kuito app');

  const scroll = globalThis.__kuito.useRef<ScrollHandle>('pager');
  const asked = () => (isSignal(page) ? page.value : (page ?? 0));
  // The page the view rests on, or is on its way to.
  let shown = asked();

  onMount(() => {
    if (shown !== 0) scroll.current?.scrollTo({ page: shown, animated: false });
  });

  watch(asked, (next) => {
    if (next === shown) return;

    shown = next;
    scroll.current?.scrollTo({ page: next });
  });

  function rested(event: ScrollEndEvent) {
    if (event.layoutWidth <= 0) return;

    const next = Math.round(event.x / event.layoutWidth);

    if (next === shown) return;

    shown = next;
    if (isSignal(page)) page.value = next;
    onPageChange?.(next);
  }

  return (
    <Scroll horizontal paging scrollbar={false} {...rest} ref={scroll} onScrollEnd={rested}>
      {children}
    </Scroll>
  );
}

/** One page of a Pager: as wide and as tall as the pager. */
export function Page(props: PageProps): KuitoNode {
  return <Box width="100%" height="100%" {...props} />;
}
