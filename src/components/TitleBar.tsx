import { BookOpenText, Maximize2, Minus, X } from "lucide-react";

export function TitleBar({ documentName }: { documentName?: string }) {
  return (
    <header className="title-bar">
      <div className="title-drag-region">
        <div className="app-mark" aria-hidden="true">
          <BookOpenText size={16} strokeWidth={2.2} />
        </div>
        <span className="app-name">Paper Reader</span>
        {documentName && <span className="title-document">{documentName}</span>}
      </div>
      {window.paperReader && (
        <div className="window-controls">
          <button type="button" onClick={() => window.paperReader?.minimize()} aria-label="最小化" title="最小化">
            <Minus size={15} />
          </button>
          <button type="button" onClick={() => window.paperReader?.toggleMaximize()} aria-label="最大化" title="最大化">
            <Maximize2 size={13} />
          </button>
          <button className="window-close" type="button" onClick={() => window.paperReader?.close()} aria-label="关闭" title="关闭">
            <X size={15} />
          </button>
        </div>
      )}
    </header>
  );
}
