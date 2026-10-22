// The native HTTP host (native/shared/Http.h) for kernel tests: records what
// `__kuitoHostHttp` receives and answers through the kernel's callbacks, as
// the platform's client does from its network thread.

/** A request as the host received it; `headers` as name/value pairs. */
export interface SentRequest {
  readonly id: number;
  readonly url: string;
  readonly method: string;
  readonly headers: [string, string][];
  readonly body: string | ArrayBuffer | FileBody | undefined;
  /** A download's destination file. */
  readonly saveTo?: string;
  /** Which way the host reports progress, when asked. */
  readonly progress?: 'send' | 'receive';
  /** The kernel asked for the body as chunks (`response.chunks`). */
  streaming: boolean;
}

/** A body read from a file, between optional bytes before and after it. */
export interface FileBody {
  readonly file: string;
  readonly prefix?: ArrayBuffer;
  readonly suffix?: ArrayBuffer;
}

/** The kernel's side of the HTTP host, installed when the host has one. */
interface HttpCallbacks {
  __kuitoHttpHead(id: number, status: number, url: string, headers: string[]): void;
  __kuitoHttpChunk(id: number, chunk: ArrayBuffer): void;
  __kuitoHttpEnd(id: number, body: ArrayBuffer, error: string): void;
}

function assertHttp(context: object): asserts context is HttpCallbacks {
  if (!('__kuitoHttpHead' in context) || !('__kuitoHttpEnd' in context))
    throw new Error('The kernel did not install the HTTP callbacks');
}

const encoder = new TextEncoder();
// Keeps a BOM, as native/shared/Utf8.h does: TextDecoder strips it itself.
const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

export const bytes = (data: string | Uint8Array): ArrayBuffer => {
  const view = typeof data === 'string' ? encoder.encode(data) : data;

  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
};

/** UTF-8 through the host, as native/shared/Standard.cpp does it with JSI strings. */
export const textHost = {
  __kuitoHostEncodeUtf8: (text: string) => bytes(text),
  __kuitoHostDecodeUtf8: (buffer: ArrayBuffer, offset: number, length: number) =>
    decoder.decode(new Uint8Array(buffer, offset, length)),
};

export interface Answer {
  status?: number;
  url?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}

export function fakeHttp() {
  const requests: SentRequest[] = [];
  const cancelled: number[] = [];
  const globals = {
    ...textHost,
    __kuitoHostHttp: {
      start(
        id: number,
        request: {
          url: string;
          method: string;
          headers: string[];
          saveTo?: string;
          progress?: 'send' | 'receive';
        },
        body: string | ArrayBuffer | FileBody | undefined,
      ) {
        const headers: [string, string][] = [];

        for (let at = 0; at < request.headers.length; at += 2)
          headers.push([request.headers[at], request.headers[at + 1]]);

        requests.push({
          id,
          url: request.url,
          method: request.method,
          headers,
          body,
          ...(request.saveTo !== undefined && { saveTo: request.saveTo }),
          ...(request.progress !== undefined && { progress: request.progress }),
          streaming: false,
        });
      },
      stream(id: number) {
        const request = requests.find((sent) => sent.id === id);

        if (request) request.streaming = true;
      },
      cancel(id: number) {
        cancelled.push(id);
      },
    },
  };

  /** Answers the requests a kernel installed in `context` sent. */
  function server(context: object) {
    assertHttp(context);

    const head = (id: number, { status = 200, url, headers = {} }: Answer = {}) =>
      context.__kuitoHttpHead(
        id,
        status,
        url ?? requests.find((sent) => sent.id === id)?.url ?? '',
        Object.entries(headers).flat(),
      );
    const chunk = (id: number, data: string | Uint8Array) =>
      context.__kuitoHttpChunk(id, bytes(data));
    const end = (id: number, body: string | Uint8Array = '', error = '') =>
      context.__kuitoHttpEnd(id, bytes(body), error);

    return {
      head,
      chunk,
      end,
      respond(id: number, answer: Answer = {}) {
        head(id, answer);
        end(id, answer.body);
      },
    };
  }

  return { globals, requests, cancelled, server };
}
