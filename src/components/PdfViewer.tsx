import { BookOpen, Highlighter, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type {
  Annotation,
  HighlightColor,
  LookupRequest,
  NormalizedRect,
  ViewPosition,
} from "../types";

type PdfViewerProps = {
  file: Blob;
  annotations: Annotation[];
  scale: number;
  highlightColor: HighlightColor;
  selectedAnnotationId: string | null;
  requestedPage: { page: number; nonce: number; position?: ViewPosition };
  onDocumentLoad: (pageCount: number) => void;
  onNavigate: (page: number, sourcePosition?: ViewPosition) => void;
  onCurrentPageChange: (position: ViewPosition) => void;
  onScaleChange: (scale: number) => void;
  onCreateAnnotations: (annotations: Annotation[]) => void;
  onLookup: (request: LookupRequest) => void;
  onSelectAnnotation: (annotation: Annotation | null) => void;
  onDeleteSelected: () => void;
  onUndo: () => void;
};

type SelectionSnapshot = {
  text: string;
  rect: DOMRect;
  context: string;
  pageIndex: number;
};

type ZoomAnchor = {
  contentX: number;
  contentY: number;
  previousScale: number;
  viewportX: number;
  viewportY: number;
};

const colorOrder: HighlightColor[] = ["yellow", "coral", "green", "blue"];
const MIN_SCALE = 0.6;
const MAX_SCALE = 1.8;
const SCALE_STEP = 0.1;

export function PdfViewer(props: PdfViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerFocused = useRef(false);
  const lastWheelZoomAt = useRef(0);
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const pendingDestinationRef = useRef<{ pageIndex: number; destination: unknown } | null>(null);
  const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const internalLinkDestinationsRef = useRef(new Map<string, unknown>());
  const internalLinksRef = useRef(new Map<string, { pageIndex: number; destination: unknown }>());
  const pendingPageRequestRef = useRef<{
    request: { page: number; nonce: number; position?: ViewPosition };
    pageIndex: number;
  } | null>(null);
  const registeredPageRequestNonceRef = useRef(0);
  const pageMetricsRef = useRef(new Map<number, { top: number; height: number }>());
  const [numPages, setNumPages] = useState(0);
  const [availableWidth, setAvailableWidth] = useState(900);
  const [pageRatio, setPageRatio] = useState(0.707);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());
  const [pageMetricsVersion, setPageMetricsVersion] = useState(0);
  const [selectionSnapshot, setSelectionSnapshot] = useState<SelectionSnapshot | null>(null);
  const [loadError, setLoadError] = useState("");
  const fileValue = useMemo(() => props.file, [props.file]);
  const pageWidth = Math.max(320, Math.min(880, availableWidth - 56)) * props.scale;
  const placeholderHeight = pageWidth / pageRatio;

  useEffect(() => {
    if (!viewerRef.current) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(viewerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setNumPages(0);
    setPageRatio(0.707);
    setRenderedPages(new Set());
    pendingDestinationRef.current = null;
    pendingPageRequestRef.current = null;
    registeredPageRequestNonceRef.current = 0;
    pdfDocumentRef.current = null;
    internalLinkDestinationsRef.current.clear();
    internalLinksRef.current.clear();
    pageMetricsRef.current.clear();
    setSelectionSnapshot(null);
    setLoadError("");
  }, [fileValue]);

  useEffect(() => {
    const root = viewerRef.current;
    if (!root) return;
    const zoomOnWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (!event.deltaY) return;

      const now = performance.now();
      if (now - lastWheelZoomAt.current < 70) return;
      const direction = event.deltaY < 0 ? 1 : -1;
      const nextScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, Number((props.scale + direction * SCALE_STEP).toFixed(2))),
      );
      if (nextScale === props.scale) return;

      const rootRect = root.getBoundingClientRect();
      const viewportX = event.clientX - rootRect.left;
      const viewportY = event.clientY - rootRect.top;
      zoomAnchorRef.current = {
        contentX: root.scrollLeft + viewportX,
        contentY: root.scrollTop + viewportY,
        previousScale: props.scale,
        viewportX,
        viewportY,
      };
      lastWheelZoomAt.current = now;
      props.onScaleChange(nextScale);
    };

    root.addEventListener("wheel", zoomOnWheel, { passive: false });
    return () => root.removeEventListener("wheel", zoomOnWheel);
  }, [props.onScaleChange, props.scale]);

  useLayoutEffect(() => {
    const root = viewerRef.current;
    const anchor = zoomAnchorRef.current;
    if (!root || !anchor || anchor.previousScale === props.scale) return;
    const ratio = props.scale / anchor.previousScale;
    root.scrollLeft = Math.max(0, anchor.contentX * ratio - anchor.viewportX);
    root.scrollTop = Math.max(0, anchor.contentY * ratio - anchor.viewportY);
    zoomAnchorRef.current = null;
  }, [props.scale]);

  useEffect(() => {
    if (!props.requestedPage.nonce) return;
    if (registeredPageRequestNonceRef.current === props.requestedPage.nonce) return;
    registeredPageRequestNonceRef.current = props.requestedPage.nonce;
    const requestedIndex = props.requestedPage.page - 1;
    if (props.requestedPage.position || pendingDestinationRef.current?.pageIndex !== requestedIndex) {
      pendingDestinationRef.current = null;
    }
    pendingPageRequestRef.current = { request: props.requestedPage, pageIndex: requestedIndex };
    setRenderedPages((previous) => {
      const next = new Set(previous);
      if (requestedIndex >= 0 && requestedIndex < numPages) next.add(requestedIndex);
      return next;
    });
    const page = viewerRef.current?.querySelector<HTMLElement>(
      `[data-page-index="${requestedIndex}"]`,
    );
    if (!props.requestedPage.position) {
      page?.scrollIntoView({
        behavior: pendingDestinationRef.current?.pageIndex === requestedIndex ? "auto" : "smooth",
        block: "start",
      });
    }
  }, [numPages, props.requestedPage]);

  useEffect(() => {
    if (!props.requestedPage.nonce) return;
    const requestedIndex = props.requestedPage.page - 1;
    const pendingRequest = pendingPageRequestRef.current;
    if (!pendingRequest || pendingRequest.request.nonce !== props.requestedPage.nonce || pendingRequest.pageIndex !== requestedIndex) return;
    if (!renderedPages.has(requestedIndex)) return;
    const page = viewerRef.current?.querySelector<HTMLElement>(
      `[data-page-index="${requestedIndex}"]`,
    );
    if (!page) return;
    const requestedPosition = pendingRequest.request.position;
    if (requestedPosition) {
      const root = viewerRef.current;
      if (root) {
        const rootRect = root.getBoundingClientRect();
        const pageRect = page.getBoundingClientRect();
        const pageTop = root.scrollTop + pageRect.top - rootRect.top;
        root.scrollTo({
          top: Math.max(0, pageTop + requestedPosition.pageOffset),
          left: Math.max(0, requestedPosition.scrollLeft),
          behavior: "auto",
        });
      }
      pendingPageRequestRef.current = null;
      return;
    }
    const pendingDestination = pendingDestinationRef.current;
    if (pendingDestination?.pageIndex === requestedIndex) {
      const metrics = pageMetricsRef.current.get(requestedIndex);
      if (!metrics && destinationNeedsOffset(pendingDestination.destination)) return;
      const offset = destinationOffset(pendingDestination.destination, metrics, page.clientHeight);
      const root = viewerRef.current;
      if (root) {
        const rootRect = root.getBoundingClientRect();
        const pageTop = root.scrollTop + page.getBoundingClientRect().top - rootRect.top;
        root.scrollTo({ top: Math.max(0, pageTop + offset - 20), behavior: "auto" });
      }
      pendingDestinationRef.current = null;
      pendingPageRequestRef.current = null;
      return;
    }
    page.scrollIntoView({ behavior: "auto", block: "start" });
    pendingPageRequestRef.current = null;
  }, [pageMetricsVersion, props.requestedPage, renderedPages]);

  const readSelection = useCallback((): SelectionSnapshot | null => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const text = selection.toString().replace(/\s+/g, " ").trim();
    if (!text) return null;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const anchorElement = selection.anchorNode instanceof Element
      ? selection.anchorNode
      : selection.anchorNode?.parentElement;
    const page = anchorElement?.closest<HTMLElement>(".pdf-page-shell");
    const pageIndex = Number(page?.dataset.pageIndex ?? 0);
    const pageText = page?.querySelector<HTMLElement>(".react-pdf__Page__textContent")?.innerText
      .replace(/\s+/g, " ")
      .trim() ?? text;
    const offset = pageText.toLowerCase().indexOf(text.toLowerCase());
    const start = offset >= 0 ? Math.max(0, offset - 110) : 0;
    const context = offset >= 0 ? pageText.slice(start, offset + text.length + 110) : text;
    return { text, rect, context, pageIndex };
  }, []);

  const createHighlight = useCallback((color: HighlightColor) => {
    const selection = window.getSelection();
    const snapshot = readSelection();
    const root = viewerRef.current;
    if (!selection || !snapshot || !root || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const clientRects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 1 && rect.height > 1 && rect.height < 80,
    );
    const groupId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const next: Annotation[] = [];

    root.querySelectorAll<HTMLElement>(".pdf-page-shell").forEach((page) => {
      const pageRect = page.getBoundingClientRect();
      const rects = clientRects
        .filter((rect) => intersects(rect, pageRect))
        .map((rect) => normalizeRect(rect, pageRect))
        .filter((rect) => rect.width > 0.001 && rect.height > 0.001);
      if (!rects.length) return;
      next.push({
        id: crypto.randomUUID(),
        groupId,
        pageIndex: Number(page.dataset.pageIndex),
        rects: mergeLineRects(rects),
        text: snapshot.text,
        color,
        note: "",
        createdAt,
      });
    });

    if (next.length) props.onCreateAnnotations(next);
    selection.removeAllRanges();
    setSelectionSnapshot(null);
  }, [props, readSelection]);

  const lookupSelection = useCallback(() => {
    const snapshot = readSelection();
    if (!snapshot) return;
    props.onLookup(snapshot);
    setSelectionSnapshot(null);
  }, [props, readSelection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable = target?.matches("input, textarea, [contenteditable='true']");
      if (editable || event.isComposing || !viewerFocused.current) return;

      if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
        event.preventDefault();
        props.onUndo();
        return;
      }
      if (event.code === "Escape") {
        window.getSelection()?.removeAllRanges();
        setSelectionSnapshot(null);
        props.onSelectAnnotation(null);
        return;
      }
      if ((event.code === "Delete" || event.code === "Backspace") && props.selectedAnnotationId) {
        event.preventDefault();
        props.onDeleteSelected();
        return;
      }
      if (event.code === "KeyH") {
        event.preventDefault();
        createHighlight(props.highlightColor);
        return;
      }
      if (event.code === "KeyD") {
        event.preventDefault();
        lookupSelection();
        return;
      }
      const colorIndex = ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(event.code);
      if (colorIndex >= 0) {
        event.preventDefault();
        createHighlight(colorOrder[colorIndex]);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [createHighlight, lookupSelection, props]);

  const getCurrentViewPosition = useCallback((): ViewPosition | null => {
    const root = viewerRef.current;
    if (!root) return null;
    const rootRect = root.getBoundingClientRect();
    const pages = Array.from(root.querySelectorAll<HTMLElement>(".pdf-page-shell"));
    if (!pages.length) return null;
    const closest = pages.reduce((best, page) => {
      const distance = Math.abs(page.getBoundingClientRect().top - rootRect.top - 24);
      return distance < best.distance ? { page, distance } : best;
    }, { page: pages[0], distance: Number.POSITIVE_INFINITY });
    const pageIndex = Number(closest.page.dataset.pageIndex);
    const pageRect = closest.page.getBoundingClientRect();
    const pageTop = root.scrollTop + pageRect.top - rootRect.top;
    return {
      page: pageIndex + 1,
      pageOffset: root.scrollTop - pageTop,
      scrollLeft: Math.round(root.scrollLeft),
    };
  }, []);

  const updateCurrentPage = () => {
    const position = getCurrentViewPosition();
    if (!position) return;
    props.onCurrentPageChange(position);
    const pageIndex = position.page - 1;
    const root = viewerRef.current;
    if (!root) return;
    const pages = Array.from(root.querySelectorAll<HTMLElement>(".pdf-page-shell"));
    setRenderedPages((previous) => {
      const next = new Set<number>();
      for (let index = Math.max(0, pageIndex - 2); index <= Math.min(pages.length - 1, pageIndex + 2); index += 1) {
        next.add(index);
      }
      if (next.size === previous.size && [...next].every((index) => previous.has(index))) return previous;
      return next;
    });
  };

  const onMouseUp = () => {
    window.setTimeout(() => {
      const snapshot = readSelection();
      setSelectionSnapshot(snapshot);
    }, 0);
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const point = { x: event.clientX, y: event.clientY };
    window.setTimeout(() => {
      const snapshot = readSelection() ?? readWordAtPoint(point.x, point.y);
      if (!snapshot || !/^[A-Za-z][A-Za-z'-]{1,79}$/.test(snapshot.text)) return;
      props.onLookup(snapshot);
      setSelectionSnapshot(null);
    }, 0);
  };

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a");
    if (link?.getAttribute("href") !== "#") return;
    const annotationId = link.getAttribute("data-element-id");
    const destination = annotationId ? internalLinksRef.current.get(annotationId) : undefined;
    const rawDestination = annotationId ? internalLinkDestinationsRef.current.get(annotationId) : undefined;
    if (destination || rawDestination !== undefined) {
      // react-pdf's internal link service uses href="#" as a placeholder.
      // Resolve the target from the annotation map instead of allowing the placeholder hash to scroll.
      event.preventDefault();
      event.stopPropagation();
      const sourcePosition = getCurrentViewPosition() ?? undefined;
      if (destination) {
        pendingDestinationRef.current = destination;
        props.onNavigate(destination.pageIndex + 1, sourcePosition);
      } else if (pdfDocumentRef.current && rawDestination !== undefined) {
        void resolveDestination(pdfDocumentRef.current, rawDestination).then((resolved) => {
          if (!resolved || !pdfDocumentRef.current) return;
          pendingDestinationRef.current = resolved;
          props.onNavigate(resolved.pageIndex + 1, sourcePosition);
        }).catch(() => undefined);
      }
      return;
    }
    event.preventDefault();
  };

  const onLoadSuccess = (document: PDFDocumentProxy) => {
    pdfDocumentRef.current = document;
    const count = document.numPages;
    setNumPages(count);
    setRenderedPages(() => {
      const next = new Set<number>();
      if (count > 0) next.add(0);
      return next;
    });
    setLoadError("");
    props.onDocumentLoad(count);
  };

  return (
    <div
      ref={viewerRef}
      className="pdf-viewer"
      onPointerDown={() => { viewerFocused.current = true; }}
      onMouseUp={onMouseUp}
      onDoubleClick={onDoubleClick}
      onClickCapture={onClickCapture}
      onScroll={updateCurrentPage}
    >
      <Document
        className="pdf-document"
        file={fileValue}
        externalLinkRel="noopener noreferrer"
        externalLinkTarget="_blank"
        onItemClick={({ pageNumber, pageIndex, dest }) => {
          if (Number.isFinite(pageNumber) && pageNumber > 0) {
            pendingDestinationRef.current = dest == null ? null : { pageIndex, destination: dest };
            props.onNavigate(pageNumber, getCurrentViewPosition() ?? undefined);
          }
        }}
        onLoadSuccess={onLoadSuccess}
        onLoadError={(error) => setLoadError(error.message || "无法打开该 PDF")}
        loading={<ViewerLoading />}
        error={<div className="viewer-error">{loadError || "无法打开该 PDF"}</div>}
      >
        {Array.from({ length: numPages }, (_, pageIndex) => (
          <div
            className="pdf-page-shell"
            data-page-index={pageIndex}
            key={`page-${pageIndex + 1}`}
            style={{
              width: pageWidth,
              ...(renderedPages.has(pageIndex) ? {} : { height: placeholderHeight }),
            }}
          >
            {renderedPages.has(pageIndex) ? (
              <Page
                pageNumber={pageIndex + 1}
                width={pageWidth}
                renderAnnotationLayer
                renderTextLayer
                onLoadSuccess={(page) => {
                  const pdfPage = page as PDFPageProxy;
                  const [left, top, right, bottom] = pdfPage.view;
                  pageMetricsRef.current.set(pageIndex, {
                    top,
                    height: Math.max(1, bottom - top),
                  });
                  if (pendingDestinationRef.current?.pageIndex === pageIndex) {
                    setPageMetricsVersion((value) => value + 1);
                  }
                  if (pageIndex !== 0) return;
                  const viewport = pdfPage.getViewport({ scale: 1 });
                  if (viewport.width > 0 && viewport.height > 0) {
                    setPageRatio(viewport.width / viewport.height);
                  }
                }}
                onGetAnnotationsSuccess={(annotations) => {
                  const document = pdfDocumentRef.current;
                  if (!document || !Array.isArray(annotations)) return;
                  annotations.forEach((annotation) => {
                    const link = annotation as { id?: string; subtype?: string; dest?: unknown };
                    if (!link.id || link.subtype !== "Link" || link.dest == null) return;
                    internalLinkDestinationsRef.current.set(link.id, link.dest);
                    void resolveDestination(document, link.dest).then((destination) => {
                      if (destination && pdfDocumentRef.current === document) {
                        internalLinksRef.current.set(link.id!, destination);
                      }
                    }).catch(() => undefined);
                  });
                }}
                loading={<div className="page-loading" style={{ width: pageWidth, height: placeholderHeight }} />}
              />
            ) : (
              <div className="page-placeholder" aria-hidden="true" />
            )}
            <div className="highlight-layer">
              {props.annotations.filter((annotation) => annotation.pageIndex === pageIndex).map((annotation) =>
                annotation.rects.map((rect, rectIndex) => (
                  <button
                    type="button"
                    key={`${annotation.id}-${rectIndex}`}
                    className={`highlight-rect ${annotation.color} ${props.selectedAnnotationId === annotation.id ? "selected" : ""}`}
                    style={{
                      left: `${rect.x * 100}%`,
                      top: `${rect.y * 100}%`,
                      width: `${rect.width * 100}%`,
                      height: `${rect.height * 100}%`,
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      props.onSelectAnnotation(annotation);
                    }}
                    aria-label={`高亮：${annotation.text}`}
                  />
                )),
              )}
            </div>
          </div>
        ))}
      </Document>

      {selectionSnapshot && (
        <div
          className="selection-toolbar"
          style={selectionToolbarPosition(selectionSnapshot.rect)}
          onPointerDown={(event) => event.preventDefault()}
        >
          <Highlighter size={16} />
          {colorOrder.map((color) => (
            <button
              type="button"
              key={color}
              className={`color-swatch ${color}`}
              onClick={() => createHighlight(color)}
              title="高亮"
              aria-label={`${color}高亮`}
            />
          ))}
          <span className="selection-divider" />
          <button type="button" className="selection-dictionary" onClick={lookupSelection} title="查词" aria-label="查词">
            <BookOpen size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function ViewerLoading() {
  return (
    <div className="viewer-loading">
      <LoaderCircle size={24} className="spin" />
      <span>正在载入文档</span>
    </div>
  );
}

function intersects(rect: DOMRect, page: DOMRect) {
  return rect.right > page.left && rect.left < page.right && rect.bottom > page.top && rect.top < page.bottom;
}

function normalizeRect(rect: DOMRect, page: DOMRect): NormalizedRect {
  const left = Math.max(rect.left, page.left);
  const right = Math.min(rect.right, page.right);
  const top = Math.max(rect.top, page.top);
  const bottom = Math.min(rect.bottom, page.bottom);
  return {
    x: (left - page.left) / page.width,
    y: (top - page.top) / page.height,
    width: (right - left) / page.width,
    height: (bottom - top) / page.height,
  };
}

function mergeLineRects(rects: NormalizedRect[]) {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  return sorted.reduce<NormalizedRect[]>((merged, rect) => {
    const last = merged.at(-1);
    if (
      last &&
      Math.abs(last.y - rect.y) < 0.006 &&
      Math.abs(last.height - rect.height) < 0.008 &&
      rect.x <= last.x + last.width + 0.012
    ) {
      last.width = Math.max(last.x + last.width, rect.x + rect.width) - last.x;
      last.y = Math.min(last.y, rect.y);
      last.height = Math.max(last.height, rect.height);
      return merged;
    }
    merged.push({ ...rect });
    return merged;
  }, []);
}

function selectionToolbarPosition(rect: DOMRect): React.CSSProperties {
  const width = 216;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2));
  const top = rect.top > 70 ? rect.top - 48 : rect.bottom + 10;
  return { left, top };
}

function destinationOffset(
  destination: unknown,
  metrics: { top: number; height: number } | undefined,
  renderedHeight: number,
) {
  if (!metrics || !Array.isArray(destination)) return 0;
  const mode = destination[1];
  const modeName = mode && typeof mode === "object" && "name" in mode
    ? String((mode as { name?: unknown }).name)
    : "";
  const topValue = modeName === "XYZ"
    ? destination[3]
    : modeName === "FitH" || modeName === "FitBH"
      ? destination[2]
      : modeName === "FitR"
        ? destination[3]
      : null;
  if (typeof topValue !== "number" || !Number.isFinite(topValue)) return 0;
  const fromTop = (topValue - metrics.top) / metrics.height;
  return Math.max(0, Math.min(renderedHeight, renderedHeight * (1 - fromTop)));
}

function destinationNeedsOffset(destination: unknown) {
  if (!Array.isArray(destination)) return false;
  const mode = destination[1];
  const modeName = mode && typeof mode === "object" && "name" in mode
    ? String((mode as { name?: unknown }).name)
    : "";
  const topValue = modeName === "XYZ"
    ? destination[3]
    : modeName === "FitH" || modeName === "FitBH"
      ? destination[2]
      : modeName === "FitR"
        ? destination[3]
      : null;
  return typeof topValue === "number" && Number.isFinite(topValue);
}

async function resolveDestination(document: PDFDocumentProxy, destination: unknown) {
  let explicitDestination: unknown;
  if (typeof destination === "string") {
    explicitDestination = await document.getDestination(destination);
  } else if (Array.isArray(destination)) {
    explicitDestination = destination;
  } else if (
    destination &&
    typeof destination === "object" &&
    "then" in destination &&
    typeof (destination as { then?: unknown }).then === "function"
  ) {
    explicitDestination = await (destination as PromiseLike<unknown>);
  }
  if (!Array.isArray(explicitDestination)) return null;

  const destinationRef = explicitDestination[0];
  let pageIndex: number;
  if (typeof destinationRef === "number") {
    pageIndex = destinationRef;
  } else if (destinationRef && typeof destinationRef === "object") {
    pageIndex = await document.getPageIndex(destinationRef);
  } else {
    return null;
  }
  return { pageIndex, destination: explicitDestination };
}

function readWordAtPoint(x: number, y: number): SelectionSnapshot | null {
  const caret = document.caretRangeFromPoint?.(x, y);
  if (!caret || caret.startContainer.nodeType !== Node.TEXT_NODE) return null;
  const node = caret.startContainer as Text;
  const value = node.data;
  if (!value) return null;
  let offset = Math.min(caret.startOffset, value.length - 1);
  if (!/[A-Za-z'-]/.test(value[offset]) && offset > 0) offset -= 1;
  if (!/[A-Za-z'-]/.test(value[offset])) return null;

  let start = offset;
  let end = offset + 1;
  while (start > 0 && /[A-Za-z'-]/.test(value[start - 1])) start -= 1;
  while (end < value.length && /[A-Za-z'-]/.test(value[end])) end += 1;

  const wordRange = document.createRange();
  wordRange.setStart(node, start);
  wordRange.setEnd(node, end);
  const element = node.parentElement;
  const page = element?.closest<HTMLElement>(".pdf-page-shell");
  const pageText = page?.querySelector<HTMLElement>(".react-pdf__Page__textContent")?.innerText
    .replace(/\s+/g, " ")
    .trim() ?? value;
  return {
    text: value.slice(start, end),
    rect: wordRange.getBoundingClientRect(),
    context: pageText,
    pageIndex: Number(page?.dataset.pageIndex ?? 0),
  };
}
