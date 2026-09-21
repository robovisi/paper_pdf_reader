import { FileText, FolderOpen } from "lucide-react";

export function EmptyState({ onOpen, onDemo }: { onOpen: () => void; onDemo: () => void }) {
  return (
    <main className="empty-workspace">
      <div className="empty-document-visual" aria-hidden="true">
        <div className="paper-sheet back" />
        <div className="paper-sheet front">
          <div className="paper-kicker">RESEARCH PAPER</div>
          <div className="paper-title-line wide" />
          <div className="paper-title-line" />
          <div className="paper-rule" />
          <div className="paper-column-grid">
            <span /><span /><span /><span /><span /><span /><span /><span />
          </div>
          <div className="paper-highlight" />
        </div>
      </div>
      <div className="empty-copy">
        <FileText size={22} />
        <h1>打开一篇论文</h1>
        <p>选择本地 PDF，或将文件拖放到窗口中。</p>
        <div className="empty-actions">
          <button className="primary-command large" type="button" onClick={onOpen}>
            <FolderOpen size={18} />
            选择 PDF
          </button>
          <button className="secondary-command large" type="button" onClick={onDemo}>
            <FileText size={18} />
            打开示例
          </button>
        </div>
      </div>
    </main>
  );
}
