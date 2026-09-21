import { LoaderCircle } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AnnotationSidebar } from "./components/AnnotationSidebar";
import { DictionaryPopover } from "./components/DictionaryPopover";
import { DocumentTabs } from "./components/DocumentTabs";
import { EmptyState } from "./components/EmptyState";
import { PageSidebar } from "./components/PageSidebar";
import { TitleBar } from "./components/TitleBar";
import { Toolbar } from "./components/Toolbar";
import { loadDocumentState, saveDocumentState } from "./services/storage";
import type {
  Annotation,
  DocumentState,
  HighlightColor,
  LookupRequest,
  OpenedPdf,
  ViewPosition,
  VocabularyItem,
} from "./types";

const PdfViewer = lazy(() => import("./components/PdfViewer").then((module) => ({
  default: module.PdfViewer,
})));

type ActiveDocument = {
  id: string;
  name: string;
  data: Blob;
};

type DocumentTab = ActiveDocument & {
  tabId: string;
  state: DocumentState;
  pageCount: number;
  stateReady: boolean;
  opening: boolean;
  history: DocumentState[];
  viewHistory: ViewPosition[];
  viewHistoryIndex: number;
};

const DEFAULT_STATE: DocumentState = {
  schemaVersion: 2,
  annotations: [],
  vocabulary: [],
  currentPage: 1,
  scale: 1,
};

const DEFAULT_VIEW_POSITION: ViewPosition = {
  page: 1,
  pageOffset: 0,
  scrollLeft: 0,
};

export default function App() {
  const [tabs, setTabs] = useState<DocumentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [highlightColor, setHighlightColor] = useState<HighlightColor>("yellow");
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [dictionaryRequest, setDictionaryRequest] = useState<LookupRequest | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [requestedPage, setRequestedPage] = useState<{
    page: number;
    nonce: number;
    position?: ViewPosition;
  }>({ page: 1, nonce: 0 });
  const openSequenceRef = useRef(0);
  const activeTabIdRef = useRef<string | null>(null);
  const navigationNonceRef = useRef(0);
  const latestTabsRef = useRef<DocumentTab[]>([]);
  const saveTimersRef = useRef(new Map<string, number>());

  const requestPage = useCallback((page: number, position?: ViewPosition) => {
    setRequestedPage({ page, nonce: ++navigationNonceRef.current, position });
  }, []);

  const activeTab = tabs.find((tab) => tab.tabId === activeTabId) ?? null;
  const activeDocument = activeTab;
  const documentState = activeTab?.state ?? DEFAULT_STATE;
  const pageCount = activeTab?.pageCount ?? 0;
  const openingDocument = activeTab?.opening ? activeTab.name : null;
  const canGoBack = Boolean(activeTab && activeTab.viewHistoryIndex > 0);
  const canGoForward = Boolean(
    activeTab && activeTab.viewHistoryIndex < activeTab.viewHistory.length - 1,
  );

  useEffect(() => {
    latestTabsRef.current = tabs;
    tabs.filter((tab) => tab.stateReady && !tab.opening).forEach((tab) => {
      const previousTimer = saveTimersRef.current.get(tab.tabId);
      if (previousTimer) window.clearTimeout(previousTimer);
      const timer = window.setTimeout(() => {
        saveTimersRef.current.delete(tab.tabId);
        void saveDocumentState(tab.id, tab.state).catch(() => undefined);
      }, 250);
      saveTimersRef.current.set(tab.tabId, timer);
    });
  }, [tabs]);

  const flushPendingSaves = useCallback(async () => {
    saveTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    saveTimersRef.current.clear();
    await Promise.all(
      latestTabsRef.current
        .filter((tab) => tab.stateReady && !tab.opening)
        .map((tab) => saveDocumentState(tab.id, tab.state)),
    );
  }, []);

  useEffect(() => {
    const unsubscribe = window.paperReader?.onCloseRequest(() => flushPendingSaves().then(() => {
      window.paperReader?.confirmClose();
    }).catch(() => {
      // Closing should not leave the native window stuck if persistence fails.
      window.paperReader?.confirmClose();
    }));
    return unsubscribe;
  }, [flushPendingSaves]);

  const loadOpenedPdf = useCallback(async (opened: OpenedPdf) => {
    const requestId = ++openSequenceRef.current;
    const pendingId = `pending-${requestId}`;
    const bytes = new Uint8Array(opened.data);
    const file = new Blob([opened.data], { type: "application/pdf" });
    activeTabIdRef.current = pendingId;
    setTabs((previous) => [
      ...previous,
      {
        tabId: pendingId,
        id: pendingId,
        name: opened.name,
        data: file,
        state: structuredClone(DEFAULT_STATE),
        pageCount: 0,
        stateReady: false,
        opening: true,
        history: [],
        viewHistory: [DEFAULT_VIEW_POSITION],
        viewHistoryIndex: 0,
      },
    ]);
    setActiveTabId(pendingId);
    setRequestedPage({ page: 1, nonce: 0 });
    setSelectedAnnotationId(null);
    setDictionaryRequest(null);

    let id = pendingId;
    let saved = structuredClone(DEFAULT_STATE);
    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      id = await hashBytes(bytes);
      saved = await loadDocumentState(id);
    } catch {
      // Keep the pending id and default state if hashing or local storage fails.
    }

    setTabs((previous) => previous.map((tab) => {
      if (tab.tabId !== pendingId) return tab;
      const initialPosition = saved.lastViewPosition ?? {
        ...DEFAULT_VIEW_POSITION,
        page: saved.currentPage || 1,
      };
      return {
        ...tab,
        id,
        state: { ...DEFAULT_STATE, ...saved },
        stateReady: true,
        opening: false,
        viewHistory: [initialPosition],
        viewHistoryIndex: 0,
      };
    }));
    if (activeTabIdRef.current === pendingId) {
      activeTabIdRef.current = pendingId;
      setActiveTabId(pendingId);
      const initialPosition = saved.lastViewPosition ?? {
        ...DEFAULT_VIEW_POSITION,
        page: saved.currentPage || 1,
      };
      requestPage(initialPosition.page, initialPosition);
    }
  }, [requestPage]);

  const openPdf = useCallback(async () => {
    if (window.paperReader) {
      const opened = await window.paperReader.openPdf();
      if (opened) await loadOpenedPdf(opened);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.arrayBuffer().then((data) => loadOpenedPdf({ name: file.name, data }));
    };
    input.click();
  }, [loadOpenedPdf]);

  const openDemo = useCallback(async () => {
    const response = await fetch("/demo-paper.pdf");
    await loadOpenedPdf({ name: "Robust Learning Systems.pdf", data: await response.arrayBuffer() });
  }, [loadOpenedPdf]);

  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      const file = event.dataTransfer?.files[0];
      if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;
      void file.arrayBuffer().then((data) => loadOpenedPdf({ name: file.name, data }));
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [loadOpenedPdf]);

  const updateState = useCallback((updater: (previous: DocumentState) => DocumentState, trackHistory = true) => {
    const tabId = activeTabIdRef.current;
    if (!tabId) return;
    setTabs((previousTabs) => previousTabs.map((tab) => {
      if (tab.tabId !== tabId) return tab;
      return {
        ...tab,
        state: updater(tab.state),
        history: trackHistory
          ? [...tab.history.slice(-29), structuredClone(tab.state)]
          : tab.history,
      };
    }));
  }, []);

  const navigateToPageForTab = useCallback((tabId: string, page: number, sourcePosition?: ViewPosition) => {
    const tab = tabs.find((item) => item.tabId === tabId);
    if (!tab) return;
    const roundedPage = Math.max(1, Math.round(page));
    const next = tab.pageCount > 0
      ? Math.min(tab.pageCount, roundedPage)
      : roundedPage;
    setTabs((previousTabs) => previousTabs.map((item) => {
      if (item.tabId !== tabId) return item;
      const currentIndex = Math.max(0, Math.min(item.viewHistory.length - 1, item.viewHistoryIndex));
      const currentEntry = item.viewHistory[currentIndex] ?? {
        page: item.state.currentPage,
        pageOffset: 0,
        scrollLeft: 0,
      };
      if (!sourcePosition && currentEntry.page === next) return item;
      const entries = item.viewHistory.slice(0, currentIndex + 1);
      if (entries.length) entries[entries.length - 1] = sourcePosition ?? currentEntry;
      else entries.push(sourcePosition ?? currentEntry);
      entries.push({
        page: next,
        pageOffset: 0,
        scrollLeft: (sourcePosition ?? currentEntry).scrollLeft,
      });
      const trimmed = entries.slice(-50);
      return {
        ...item,
        state: {
          ...item.state,
          currentPage: next,
          lastViewPosition: {
            page: next,
            pageOffset: sourcePosition?.page === next ? sourcePosition.pageOffset : 0,
            scrollLeft: sourcePosition?.scrollLeft ?? currentEntry.scrollLeft,
          },
        },
        viewHistory: trimmed,
        viewHistoryIndex: trimmed.length - 1,
      };
    }));
    if (activeTabIdRef.current === tabId) {
      requestPage(next);
    }
  }, [requestPage, tabs]);

  const navigateToPage = useCallback((page: number, sourcePosition?: ViewPosition) => {
    const tabId = activeTabIdRef.current;
    if (tabId) navigateToPageForTab(tabId, page, sourcePosition);
  }, [navigateToPageForTab]);

  const moveViewHistory = useCallback((direction: -1 | 1) => {
    const tabId = activeTabIdRef.current;
    if (!tabId) return;
    const tab = tabs.find((item) => item.tabId === tabId);
    if (!tab) return;
    const nextIndex = Math.max(0, Math.min(tab.viewHistory.length - 1, tab.viewHistoryIndex + direction));
    if (nextIndex === tab.viewHistoryIndex) return;
    const nextPosition = tab.viewHistory[nextIndex];
    if (!nextPosition) return;
    setTabs((previousTabs) => previousTabs.map((item) => item.tabId === tabId
      ? {
          ...item,
          state: {
            ...item.state,
            currentPage: nextPosition.page,
            lastViewPosition: nextPosition,
          },
          viewHistoryIndex: nextIndex,
        }
      : item));
    requestPage(nextPosition.page, nextPosition);
  }, [requestPage, tabs]);

  const selectTab = useCallback((tabId: string) => {
    const tab = tabs.find((item) => item.tabId === tabId);
    if (!tab || tab.tabId === activeTabIdRef.current) return;
    activeTabIdRef.current = tabId;
    setActiveTabId(tabId);
    setSelectedAnnotationId(null);
    setDictionaryRequest(null);
    const position = tab.viewHistory[tab.viewHistoryIndex] ?? {
      ...(tab.state.lastViewPosition ?? DEFAULT_VIEW_POSITION),
      page: tab.state.lastViewPosition?.page ?? tab.state.currentPage,
    };
    requestPage(position.page, position);
  }, [requestPage, tabs]);

  const closeTab = useCallback((tabId: string) => {
    const index = tabs.findIndex((tab) => tab.tabId === tabId);
    if (index < 0) return;
    const closingTab = tabs[index];
    const pendingSave = saveTimersRef.current.get(tabId);
    if (pendingSave) {
      window.clearTimeout(pendingSave);
      saveTimersRef.current.delete(tabId);
    }
    if (closingTab.stateReady && !closingTab.opening) {
      const latestPosition = closingTab.viewHistory[closingTab.viewHistoryIndex] ?? closingTab.state.lastViewPosition;
      const stateToSave = latestPosition
        ? { ...closingTab.state, currentPage: latestPosition.page, lastViewPosition: latestPosition }
        : closingTab.state;
      void saveDocumentState(closingTab.id, stateToSave).catch(() => undefined);
    }
    const nextTabs = tabs.filter((tab) => tab.tabId !== tabId);
    const closingActive = activeTabIdRef.current === tabId;
    let nextActiveId = activeTabIdRef.current;
    if (closingActive) {
      nextActiveId = nextTabs[Math.min(index, nextTabs.length - 1)]?.tabId ?? null;
    }
    setTabs(nextTabs);
    activeTabIdRef.current = nextActiveId;
    setActiveTabId(nextActiveId);
    setSelectedAnnotationId(null);
    setDictionaryRequest(null);
    const nextActive = nextTabs.find((tab) => tab.tabId === nextActiveId);
    const position = nextActive?.viewHistory[nextActive.viewHistoryIndex];
    requestPage(position?.page ?? nextActive?.state.currentPage ?? 1, position);
  }, [requestPage, tabs]);

  const selectedAnnotation = documentState.annotations.find(
    (annotation) => annotation.id === selectedAnnotationId,
  ) ?? null;

  const deleteAnnotation = useCallback((annotation: Annotation) => {
    updateState((previous) => ({
      ...previous,
      annotations: previous.annotations.filter((item) => item.groupId !== annotation.groupId),
    }));
    setSelectedAnnotationId(null);
  }, [updateState]);

  const undo = useCallback(() => {
    const tabId = activeTabIdRef.current;
    if (!tabId) return;
    const tabWithHistory = tabs.find((tab) => tab.tabId === tabId);
    if (!tabWithHistory?.history.length) return;
    setTabs((previousTabs) => previousTabs.map((tab) => {
      if (tab.tabId !== tabId) return tab;
      const previous = tab.history.at(-1);
      if (!previous) return tab;
      return { ...tab, state: previous, history: tab.history.slice(0, -1) };
    }));
    setSelectedAnnotationId(null);
  }, [tabs]);

  const changeScale = useCallback((scale: number) => {
    const tabId = activeTabIdRef.current;
    if (!tabId) return;
    setTabs((previousTabs) => previousTabs.map((tab) => {
      if (tab.tabId !== tabId) return tab;
      const nextScale = Math.max(0.6, Math.min(1.8, Number(scale.toFixed(2))));
      return tab.state.scale === nextScale
        ? tab
        : { ...tab, state: { ...tab.state, scale: nextScale } };
    }));
  }, []);

  const updateCurrentPageForTab = useCallback((tabId: string, position: ViewPosition) => {
    setTabs((previousTabs) => previousTabs.map((tab) => {
      if (tab.tabId !== tabId) return tab;
      const currentIndex = Math.max(0, Math.min(tab.viewHistory.length - 1, tab.viewHistoryIndex));
      const currentEntry = tab.viewHistory[currentIndex];
      const historyChanged = !currentEntry || !sameViewPosition(currentEntry, position);
      if (!historyChanged && tab.state.currentPage === position.page) return tab;
      const viewHistory = [...tab.viewHistory];
      if (viewHistory.length) viewHistory[currentIndex] = position;
      else viewHistory.push(position);
      return {
        ...tab,
        state: {
          ...tab.state,
          currentPage: position.page,
          lastViewPosition: position,
        },
        viewHistory,
      };
    }));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if (!(event.ctrlKey || event.metaKey) || !tabs.length) return;

      if (event.code === "KeyW") {
        event.preventDefault();
        const tabId = activeTabIdRef.current;
        if (tabId) closeTab(tabId);
        return;
      }

      if (event.code !== "Tab" || tabs.length < 2) return;
      event.preventDefault();
      const index = tabs.findIndex((tab) => tab.tabId === activeTabIdRef.current);
      const step = event.shiftKey ? -1 : 1;
      const next = tabs[(index + step + tabs.length) % tabs.length];
      if (next) selectTab(next.tabId);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeTab, selectTab, tabs]);

  return (
    <div className="app-shell">
      <TitleBar documentName={activeDocument?.name} />
      <DocumentTabs
        tabs={tabs.map((tab) => ({ id: tab.tabId, name: tab.name, opening: tab.opening }))}
        activeTabId={activeTabId}
        onSelect={selectTab}
        onClose={closeTab}
        onOpen={openPdf}
      />
      <Toolbar
        hasDocument={Boolean(activeDocument) && !openingDocument}
        currentPage={documentState.currentPage}
        pageCount={pageCount}
        scale={documentState.scale}
        highlightColor={highlightColor}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onOpen={openPdf}
        onPageChange={navigateToPage}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={() => moveViewHistory(-1)}
        onForward={() => moveViewHistory(1)}
        onScaleChange={changeScale}
        onColorChange={setHighlightColor}
        onUndo={undo}
        onToggleLeft={() => setLeftOpen((value) => !value)}
        onToggleRight={() => setRightOpen((value) => !value)}
      />

      {!activeDocument ? (
        <EmptyState onOpen={openPdf} onDemo={openDemo} />
      ) : (
        <div className={`reader-layout ${leftOpen ? "left-open" : ""} ${rightOpen ? "right-open" : ""}`}>
          {openingDocument && (
            <div className="pdf-opening-overlay" aria-live="polite">
              <LoaderCircle size={18} className="spin" />
              正在载入 {openingDocument}
            </div>
          )}
          {leftOpen && (
            <PageSidebar
              pageCount={pageCount}
              currentPage={documentState.currentPage}
              documentName={activeDocument.name}
              onPageSelect={navigateToPage}
            />
          )}
          <Suspense fallback={<div className="viewer-loading"><LoaderCircle size={24} className="spin" /><span>正在准备阅读器</span></div>}>
            <PdfViewer
              key={activeTab.tabId}
              file={activeDocument.data}
              annotations={documentState.annotations}
              scale={documentState.scale}
              highlightColor={highlightColor}
              selectedAnnotationId={selectedAnnotationId}
              requestedPage={requestedPage}
              onDocumentLoad={(count) => {
                const tabId = activeTab.tabId;
                setTabs((previousTabs) => previousTabs.map((tab) => {
                  if (tab.tabId !== tabId) return tab;
                  const currentPosition = tab.state.lastViewPosition ?? tab.viewHistory[tab.viewHistoryIndex] ?? DEFAULT_VIEW_POSITION;
                  const safePage = Math.max(1, Math.min(count, tab.state.currentPage));
                  const safePosition = safePage === currentPosition.page
                    ? currentPosition
                    : { ...currentPosition, page: safePage, pageOffset: 0 };
                  const viewHistory = tab.viewHistory.map((position, index) => index === tab.viewHistoryIndex ? safePosition : position);
                  return {
                    ...tab,
                    pageCount: count,
                    state: { ...tab.state, currentPage: safePage, lastViewPosition: safePosition },
                    viewHistory,
                  };
                }));
              }}
              onNavigate={(page, sourcePosition) => navigateToPageForTab(activeTab.tabId, page, sourcePosition)}
              onCurrentPageChange={(position) => updateCurrentPageForTab(activeTab.tabId, position)}
              onScaleChange={changeScale}
              onCreateAnnotations={(annotations) => updateState((previous) => ({
                ...previous,
                annotations: [...previous.annotations, ...annotations],
              }))}
              onLookup={setDictionaryRequest}
              onSelectAnnotation={(annotation) => setSelectedAnnotationId(annotation?.id ?? null)}
              onDeleteSelected={() => {
                if (selectedAnnotation) deleteAnnotation(selectedAnnotation);
              }}
              onUndo={undo}
            />
          </Suspense>
          {rightOpen && (
            <AnnotationSidebar
              annotations={documentState.annotations}
              vocabulary={documentState.vocabulary}
              selectedAnnotationId={selectedAnnotationId}
              onSelectAnnotation={(annotation) => {
                setSelectedAnnotationId(annotation.id);
                navigateToPage(annotation.pageIndex + 1);
              }}
              onDeleteAnnotation={deleteAnnotation}
              onSelectVocabulary={(item) => navigateToPage(item.pageIndex + 1)}
            />
          )}
        </div>
      )}

      <DictionaryPopover
        request={dictionaryRequest}
        onClose={() => setDictionaryRequest(null)}
        onSave={(item: VocabularyItem) => updateState((previous) => {
          const duplicate = previous.vocabulary.some(
            (value) => value.headword === item.headword,
          );
          return duplicate ? previous : { ...previous, vocabulary: [item, ...previous.vocabulary] };
        })}
      />
    </div>
  );
}

async function hashBytes(bytes: Uint8Array) {
  if (crypto.subtle) {
    // Keep the tab-owned buffer transferable to PDF.js after hashing.
    const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
    return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (const value of bytes) hash = Math.imul(hash ^ value, 16777619);
  return `fnv-${(hash >>> 0).toString(16)}`;
}

function sameViewPosition(left: ViewPosition, right: ViewPosition) {
  return left.page === right.page
    && Math.abs(left.pageOffset - right.pageOffset) < 1
    && Math.abs(left.scrollLeft - right.scrollLeft) < 1;
}
