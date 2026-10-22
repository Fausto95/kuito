import { setViewProp } from './flatten';
import { SCROLLING_KINDS } from './protocol.generated';

export function isScrollingKind(kind: string): boolean {
  return SCROLLING_KINDS.includes(kind);
}

/**
 * A scrolling view's element scrolls on request. A request is a prop the
 * native view acts on each time it receives one, once the layout has sized
 * the content the same batch brought. Numbered, as the kernel skips an
 * object prop equal to the last one sent and the same request again must
 * scroll again.
 */
export function scrollMethods(id: number, attached: () => boolean) {
  let requests = 0;

  function send(
    request: { offset: number } | { end: true } | { page: number },
    animated: boolean,
  ): void {
    if (!attached()) throw Error('Detached native element');

    requests += 1;
    setViewProp(id, 'scrollTo', { ...request, animated, request: requests });
  }

  return {
    scrollTo(
      params: { offset: number; animated?: boolean } | { page: number; animated?: boolean },
    ): void {
      const animated = params.animated ?? true;

      if ('page' in params) {
        if (!Number.isInteger(params.page) || params.page < 0)
          throw new TypeError('scrollTo takes a page from 0, not ' + String(params.page));

        return send({ page: params.page }, animated);
      }

      if (!Number.isFinite(params.offset))
        throw new TypeError('scrollTo takes an offset in points, not ' + String(params.offset));

      send({ offset: params.offset }, animated);
    },
    scrollToEnd({ animated = true }: { animated?: boolean } = {}): void {
      send({ end: true }, animated);
    },
  };
}
