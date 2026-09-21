/// <reference types="vite/client" />

import type { DocumentState, OfflineDictionaryRecord, OpenedPdf } from "./types";

declare global {
  interface Window {
    paperReader?: {
      platform: string;
      openPdf(): Promise<OpenedPdf | null>;
      loadState(documentId: string): Promise<DocumentState | null>;
      saveState(documentId: string, state: DocumentState): Promise<void>;
      lookupDictionary(word: string): Promise<OfflineDictionaryRecord | null>;
      minimize(): void;
      toggleMaximize(): void;
      close(): Promise<void>;
      onCloseRequest(handler: () => void | Promise<void>): () => void;
      confirmClose(): void;
    };
  }
}

export {};
