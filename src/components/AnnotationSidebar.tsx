import { BookOpenCheck, Bookmark, Highlighter, SearchX, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Annotation, VocabularyItem } from "../types";

type AnnotationSidebarProps = {
  annotations: Annotation[];
  vocabulary: VocabularyItem[];
  selectedAnnotationId: string | null;
  onSelectAnnotation: (annotation: Annotation) => void;
  onDeleteAnnotation: (annotation: Annotation) => void;
  onSelectVocabulary: (item: VocabularyItem) => void;
};

export function AnnotationSidebar(props: AnnotationSidebarProps) {
  const [tab, setTab] = useState<"annotations" | "vocabulary">("annotations");
  const groupedAnnotations = useMemo(
    () => [...props.annotations].sort((a, b) => a.pageIndex - b.pageIndex || a.createdAt.localeCompare(b.createdAt)),
    [props.annotations],
  );

  return (
    <aside className="right-sidebar">
      <div className="sidebar-tabs" role="tablist">
        <button type="button" className={tab === "annotations" ? "active" : ""} onClick={() => setTab("annotations")}>
          标注
          <span>{props.annotations.length}</span>
        </button>
        <button type="button" className={tab === "vocabulary" ? "active" : ""} onClick={() => setTab("vocabulary")}>
          生词
          <span>{props.vocabulary.length}</span>
        </button>
      </div>

      {tab === "annotations" ? (
        groupedAnnotations.length ? (
          <div className="sidebar-items">
            {groupedAnnotations.map((annotation) => (
              <article
                key={annotation.id}
                className={`annotation-item ${props.selectedAnnotationId === annotation.id ? "selected" : ""}`}
                onClick={() => props.onSelectAnnotation(annotation)}
              >
                <div className="annotation-meta">
                  <span className={`annotation-color ${annotation.color}`} />
                  <span>第 {annotation.pageIndex + 1} 页</span>
                  <button type="button" onClick={(event) => { event.stopPropagation(); props.onDeleteAnnotation(annotation); }} title="删除标注" aria-label="删除标注">
                    <Trash2 size={14} />
                  </button>
                </div>
                <p>{annotation.text}</p>
              </article>
            ))}
          </div>
        ) : (
          <SidebarEmpty icon={<Highlighter size={21} />} title="暂无标注" />
        )
      ) : props.vocabulary.length ? (
        <div className="sidebar-items">
          {props.vocabulary.map((item) => (
            <article key={item.id} className="vocabulary-item" onClick={() => props.onSelectVocabulary(item)}>
              <div className="vocabulary-heading">
                <Bookmark size={14} />
                <strong>{item.headword}</strong>
                <span>第 {item.pageIndex + 1} 页</span>
              </div>
              {item.phonetic && <div className="vocabulary-phonetic">{item.phonetic}</div>}
              <p>{item.definition}</p>
            </article>
          ))}
        </div>
      ) : (
        <SidebarEmpty icon={<BookOpenCheck size={21} />} title="暂无生词" />
      )}
    </aside>
  );
}

function SidebarEmpty({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="sidebar-empty">
      {icon || <SearchX size={21} />}
      <span>{title}</span>
    </div>
  );
}
