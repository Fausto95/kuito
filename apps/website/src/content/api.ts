/** Shape of `reference.generated.json`, the full API reference the server reads on demand. */

export type ApiTag = { name: string; text: string };

export type ApiParameter = {
  name: string;
  type: string;
  optional: boolean;
  rest: boolean;
  description: string;
  default?: string;
};

export type ApiSignature = {
  signature: string;
  typeParameters: { name: string; constraint: string | null; default: string | null }[];
  parameters: ApiParameter[];
  returns: string;
};

export type ApiMember = {
  name: string;
  type: string;
  optional: boolean;
  readonly: boolean;
  description: string;
  tags: ApiTag[];
  default?: string;
  overloads?: ApiSignature[];
  children?: ApiMember[];
};

export type ApiEntry = {
  id: string;
  name: string;
  kind: string;
  section: string;
  description: string;
  tags: ApiTag[];
  source: { file: string; line: number } | null;
  declaration: string;
  type: string;
  overloads: ApiSignature[];
  constructors: ApiSignature[];
  members: ApiMember[];
  propsType?: string;
  children?: string[];
};

export type ApiReference = {
  version: string;
  generated: string;
  counts: Record<string, number>;
  entries: ApiEntry[];
};

import websiteDescriptions from '../../content/api/descriptions.json' with { type: 'json' };

const sentences = websiteDescriptions as Record<string, string>;

let loaded: Promise<Map<string, ApiEntry>> | undefined;

/** The 7 MB reference stays in its own server chunk, parsed once per isolate. */
export function apiEntryById(id: string): Promise<ApiEntry | undefined> {
  loaded ??= import('./reference.generated.json').then(
    (module) =>
      new Map(
        (module.default as ApiReference).entries.map((entry) => [
          entry.id,
          { ...entry, description: entry.description || sentences[entry.id] || '' },
        ]),
      ),
  );

  return loaded.then((entries) => entries.get(id));
}
