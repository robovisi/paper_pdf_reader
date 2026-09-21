import { FileText } from "lucide-react";

type PageSidebarProps = {
  pageCount: number;
  currentPage: number;
  documentName: string;
  onPageSelect: (page: number) => void;
};

export function PageSidebar({ pageCount, currentPage, documentName, onPageSelect }: PageSidebarProps) {
  return (
    <aside className="left-sidebar">
      <div className="sidebar-heading">
        <span>页面</span>
        <span className="muted-count">{pageCount}</span>
      </div>
      <div className="document-summary" title={documentName}>
        <FileText size={16} />
        <span>{documentName}</span>
      </div>
      <nav className="page-list" aria-label="页面列表">
        {Array.from({ length: pageCount }, (_, index) => {
          const page = index + 1;
          return (
            <button
              key={page}
              type="button"
              className={page === currentPage ? "active" : ""}
              onClick={() => onPageSelect(page)}
            >
              <span className="page-miniature">
                <span className="miniature-line" />
                <span className="miniature-line short" />
                <span className="miniature-block" />
              </span>
              <span>第 {page} 页</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
