export type HighlightColor = "yellow" | "coral" | "green" | "blue";

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Annotation = {
  id: string;
  groupId: string;
  pageIndex: number;
  rects: NormalizedRect[];
  text: string;
  color: HighlightColor;
  note: string;
  createdAt: string;
};

export type VocabularyItem = {
  id: string;
  headword: string;
  selectedForm: string;
  phonetic: string;
  definition: string;
  context: string;
  pageIndex: number;
  createdAt: string;
};

export type DocumentState = {
  annotations: Annotation[];
  vocabulary: VocabularyItem[];
  currentPage: number;
  scale: number;
};

export type ViewPosition = {
  page: number;
  pageOffset: number;
  scrollLeft: number;
};

export type OpenedPdf = {
  name: string;
  path?: string;
  data: ArrayBuffer;
};

export type DictionarySense = {
  partOfSpeech: string;
  definition: string;
  definitionZh?: string;
  example?: string;
};

export type DictionaryEntry = {
  word: string;
  lemma: string;
  phonetic: string;
  senses: DictionarySense[];
  source: "local";
  sourceName?: string;
};

export type OfflineDictionaryRecord = [
  word: string,
  phonetic: string,
  definition: string,
  translation: string,
  partOfSpeech: string,
  exchange: string,
];

export type LookupRequest = {
  text: string;
  context: string;
  rect: DOMRect;
  pageIndex: number;
};
