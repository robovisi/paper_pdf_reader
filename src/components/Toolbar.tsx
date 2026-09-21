import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
} from "lucide-react";
import type { HighlightColor } from "../types";

type ToolbarProps = {
  hasDocument: boolean;
  currentPage: number;
  pageCount: number;
  scale: number;
  highlightColor: HighlightColor;
  leftOpen: boolean;
  rightOpen: boolean;
  onOpen: () => void;
  onPageChange: (page: number) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onScaleChange: (scale: number) => void;
  onColorChange: (color: HighlightColor) => void;
  onUndo: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
};

const colors: HighlightColor[] = ["yellow", "coral", "green", "blue"];

export function Toolbar(props: ToolbarProps) {
  const page = Math.max(1, Math.min(props.pageCount || 1, props.currentPage));

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button className="icon-button" type="button" onClick={props.onToggleLeft} title={props.leftOpen ? "收起页面栏" : "展开页面栏"} aria-label={props.leftOpen ? "收起页面栏" : "展开页面栏"}>
          {props.leftOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
        <button className="primary-command" type="button" onClick={props.onOpen}>
          <FilePlus2 size={17} />
          打开 PDF
        </button>
        <div className="history-control" aria-label="阅读历史">
          <button type="button" className="icon-button compact" disabled={!props.canGoBack} onClick={props.onBack} title="返回上个视图" aria-label="返回上个视图">
            <ArrowLeft size={17} />
          </button>
          <button type="button" className="icon-button compact" disabled={!props.canGoForward} onClick={props.onForward} title="前进到下个视图" aria-label="前进到下个视图">
            <ArrowRight size={17} />
          </button>
        </div>
      </div>

      <div className="toolbar-center">
        <div className="page-control" aria-label="页码">
          <button type="button" className="icon-button compact" disabled={!props.hasDocument || page <= 1} onClick={() => props.onPageChange(page - 1)} title="上一页" aria-label="上一页">
            <ChevronLeft size={17} />
          </button>
          <input
            value={props.hasDocument ? page : ""}
            disabled={!props.hasDocument}
            aria-label="当前页"
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value)) props.onPageChange(value);
            }}
          />
          <span>/ {props.hasDocument ? props.pageCount : 0}</span>
          <button type="button" className="icon-button compact" disabled={!props.hasDocument || page >= props.pageCount} onClick={() => props.onPageChange(page + 1)} title="下一页" aria-label="下一页">
            <ChevronRight size={17} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="zoom-control">
          <button type="button" className="icon-button compact" disabled={!props.hasDocument || props.scale <= 0.65} onClick={() => props.onScaleChange(props.scale - 0.1)} title="缩小" aria-label="缩小">
            <Minus size={16} />
          </button>
          <button type="button" className="zoom-value" disabled={!props.hasDocument} onClick={() => props.onScaleChange(1)} title="恢复 100%">
            {Math.round(props.scale * 100)}%
          </button>
          <button type="button" className="icon-button compact" disabled={!props.hasDocument || props.scale >= 1.8} onClick={() => props.onScaleChange(props.scale + 0.1)} title="放大" aria-label="放大">
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="toolbar-group toolbar-right">
        <button type="button" className="icon-button" disabled={!props.hasDocument} onClick={props.onUndo} title="撤销" aria-label="撤销">
          <RotateCcw size={17} />
        </button>
        <div className="color-segment" aria-label="高亮颜色">
          <BookMarked size={17} />
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              className={`color-swatch ${color} ${props.highlightColor === color ? "active" : ""}`}
              onClick={() => props.onColorChange(color)}
              title={`选择${color === "yellow" ? "黄色" : color === "coral" ? "珊瑚色" : color === "green" ? "绿色" : "蓝色"}高亮`}
              aria-label={`选择${color}高亮`}
            />
          ))}
        </div>
        <button className="icon-button" type="button" onClick={props.onToggleRight} title={props.rightOpen ? "收起标注栏" : "展开标注栏"} aria-label={props.rightOpen ? "收起标注栏" : "展开标注栏"}>
          {props.rightOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </button>
      </div>
    </div>
  );
}
