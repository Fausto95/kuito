/** The six documentation sections, in navigation order. Shared by client and server. */
export const sectionIds = [
  'guides',
  'components',
  'apis',
  'architecture',
  'cli',
  'language',
] as const;

export type SectionId = (typeof sectionIds)[number];

export const isSectionId = (value: string): value is SectionId =>
  (sectionIds as readonly string[]).includes(value);
