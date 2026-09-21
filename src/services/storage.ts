import type { Annotation, DocumentState, ViewPosition, VocabularyItem } from "../types";

const emptyState: DocumentState = {
  schemaVersion: 2,
  annotations: [],
  vocabulary: [],
  currentPage: 1,
  scale: 1,
};

function cloneEmptyState(): DocumentState {
  return structuredClone(emptyState);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isViewPosition(value: unknown): value is ViewPosition {
  if (!isRecord(value)) return false;
  return Number.isFinite(value.page)
    && Number.isFinite(value.pageOffset)
    && Number.isFinite(value.scrollLeft)
    && Number(value.page) >= 1;
}

function isNormalizedRect(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return [value.x, value.y, value.width, value.height].every(
    (part) => typeof part === "number" && Number.isFinite(part),
  );
}

function isAnnotation(value: unknown): value is Annotation {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.groupId !== "string") return false;
  if (typeof value.pageIndex !== "number" || value.pageIndex < 0 || !Array.isArray(value.rects) || typeof value.text !== "string") return false;
  if (!value.rects.every(isNormalizedRect)) return false;
  return ["yellow", "coral", "green", "blue"].includes(value.color as string)
    && typeof value.note === "string"
    && typeof value.createdAt === "string";
}

function isVocabularyItem(value: unknown): value is VocabularyItem {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.headword === "string"
    && typeof value.selectedForm === "string"
    && typeof value.phonetic === "string"
    && typeof value.definition === "string"
    && typeof value.context === "string"
    && typeof value.pageIndex === "number"
    && typeof value.createdAt === "string";
}

export function parseDocumentState(value: unknown): DocumentState {
  if (!isRecord(value)) return cloneEmptyState();
  const annotations = Array.isArray(value.annotations)
    ? value.annotations.filter(isAnnotation)
    : [];
  const vocabulary = Array.isArray(value.vocabulary)
    ? value.vocabulary.filter(isVocabularyItem)
    : [];
  const currentPage = typeof value.currentPage === "number" && Number.isFinite(value.currentPage)
    ? Math.max(1, Math.round(value.currentPage))
    : 1;
  const scale = typeof value.scale === "number" && Number.isFinite(value.scale)
    ? Math.max(0.6, Math.min(1.8, value.scale))
    : 1;
  const lastViewPosition = isViewPosition(value.lastViewPosition)
    ? {
        page: Math.max(1, Math.round(value.lastViewPosition.page)),
        pageOffset: Math.max(0, value.lastViewPosition.pageOffset),
        scrollLeft: Math.max(0, value.lastViewPosition.scrollLeft),
      }
    : undefined;
  return {
    schemaVersion: 2,
    annotations,
    vocabulary,
    currentPage,
    scale,
    ...(lastViewPosition ? { lastViewPosition } : {}),
  };
}

export async function loadDocumentState(documentId: string): Promise<DocumentState> {
  if (window.paperReader) {
    return parseDocumentState(await window.paperReader.loadState(documentId));
  }
  try {
    const value = localStorage.getItem(`paper-reader:${documentId}`);
    return parseDocumentState(value ? JSON.parse(value) : null);
  } catch {
    return cloneEmptyState();
  }
}

export async function saveDocumentState(documentId: string, state: DocumentState) {
  if (window.paperReader) {
    await window.paperReader.saveState(documentId, state);
    return;
  }
  localStorage.setItem(`paper-reader:${documentId}`, JSON.stringify(state));
}
