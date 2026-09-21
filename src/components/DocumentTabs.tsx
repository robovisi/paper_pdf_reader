import { FileText, Plus, X } from "lucide-react";

export type DocumentTabItem = {
  id: string;
  name: string;
  opening?: boolean;
};

type DocumentTabsProps = {
  tabs: DocumentTabItem[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onOpen: () => void;
};

export function DocumentTabs({ tabs, activeTabId, onSelect, onClose, onOpen }: DocumentTabsProps) {
  return (
    <div className="document-tabs" role="tablist" aria-label="打开的 PDF">
      <div className="document-tab-list">
        {tabs.map((tab) => (
          <div
            className={`document-tab ${tab.id === activeTabId ? "active" : ""}`}
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTabId}
            tabIndex={tab.id === activeTabId ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(tab.id);
              }
            }}
          >
            <FileText size={14} aria-hidden="true" />
            <span className="document-tab-name">{tab.name}</span>
            {tab.opening && <span className="document-tab-status">载入中</span>}
            <button
              type="button"
              className="document-tab-close"
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.id);
              }}
              aria-label={`关闭 ${tab.name}`}
              title="关闭页签"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="document-tab-add" onClick={onOpen} aria-label="打开新的 PDF" title="打开新的 PDF">
        <Plus size={16} />
      </button>
    </div>
  );
}
