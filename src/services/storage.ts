import type { DocumentState } from "../types";

const emptyState: DocumentState = {
  annotations: [],
  vocabulary: [],
  currentPage: 1,
  scale: 1,
};

export async function loadDocumentState(documentId: string): Promise<DocumentState> {
  if (window.paperReader) {
    return (await window.paperReader.loadState(documentId)) ?? structuredClone(emptyState);
  }
  try {
    const value = localStorage.getItem(`paper-reader:${documentId}`);
    return value ? JSON.parse(value) : structuredClone(emptyState);
  } catch {
    return structuredClone(emptyState);
  }
}

export async function saveDocumentState(documentId: string, state: DocumentState) {
  if (window.paperReader) {
    await window.paperReader.saveState(documentId, state);
    return;
  }
  localStorage.setItem(`paper-reader:${documentId}`, JSON.stringify(state));
}
