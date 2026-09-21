import { BookmarkPlus, LoaderCircle, RefreshCw, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { lookupDictionary } from "../services/dictionary";
import type { DictionaryEntry, LookupRequest, VocabularyItem } from "../types";

type DictionaryPopoverProps = {
  request: LookupRequest | null;
  onClose: () => void;
  onSave: (item: VocabularyItem) => void;
};

export function DictionaryPopover({ request, onClose, onSave }: DictionaryPopoverProps) {
  const popoverRef = useRef<HTMLElement>(null);
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!request) return;
    let active = true;
    const controller = new AbortController();

    setLoading(true);
    setNotFound(false);
    setError(false);
    setEntry(null);
    void lookupDictionary(request.text, controller.signal)
      .then((result) => {
        if (!active) return;
        setEntry(result);
        setNotFound(!result);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [request, retryToken]);

  useEffect(() => {
    if (!request) return;
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || popoverRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
  }, [onClose, request]);

  const position = useMemo(() => {
    if (!request) return {};
    const width = 360;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, request.rect.left));
    const desiredTop = request.rect.bottom + 10;
    const top = desiredTop + 360 < window.innerHeight
      ? desiredTop
      : Math.max(54, request.rect.top - 370);
    return { left, top };
  }, [request]);

  if (!request) return null;

  const speak = () => {
    if (!entry || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(entry.lemma);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  };

  return (
    <section ref={popoverRef} className="dictionary-popover" style={position} aria-live="polite">
      <div className="dictionary-header">
        <div>
          <h2>{entry?.lemma || request.text.trim()}</h2>
          {entry && entry.word !== entry.lemma && <span className="word-form">{entry.word} → {entry.lemma}</span>}
        </div>
        <div className="dictionary-actions">
          <button type="button" disabled={!entry} onClick={speak} title="朗读" aria-label="朗读">
            <Volume2 size={17} />
          </button>
          <button
            type="button"
            disabled={!entry}
            onClick={() => {
              if (!entry) return;
              const firstSense = entry.senses[0];
              onSave({
                id: crypto.randomUUID(),
                headword: entry.lemma,
                selectedForm: request.text,
                phonetic: entry.phonetic,
                definition: firstSense?.definitionZh || firstSense?.definition || "",
                context: request.context,
                pageIndex: request.pageIndex,
                createdAt: new Date().toISOString(),
              });
            }}
            title="加入生词本"
            aria-label="加入生词本"
          >
            <BookmarkPlus size={17} />
          </button>
          <button type="button" onClick={onClose} title="关闭" aria-label="关闭">
            <X size={17} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="dictionary-loading">
          <LoaderCircle size={20} className="spin" />
          <span>正在查询</span>
        </div>
      )}

      {notFound && <div className="dictionary-not-found">未找到该词或短语。</div>}

      {error && (
        <div className="dictionary-error" role="alert">
          <span>离线词典读取失败，请重试。</span>
          <button
            type="button"
            className="dictionary-retry"
            onClick={() => setRetryToken((value) => value + 1)}
          >
            <RefreshCw size={14} />
            重试
          </button>
        </div>
      )}

      {entry && (
        <>
          <div className="pronunciation-row">
            <span>{entry.phonetic || "暂无音标"}</span>
            <small>{entry.sourceName || "本地词典"}</small>
          </div>
          <div className="sense-list">
            {entry.senses.map((sense, index) => (
              <div className="dictionary-sense" key={`${sense.partOfSpeech}-${index}`}>
                <div className="sense-number">{index + 1}</div>
                <div>
                  <span className="part-of-speech">{sense.partOfSpeech}</span>
                  {sense.definitionZh && <p className="definition-zh">{sense.definitionZh}</p>}
                  {sense.definition && <p className="definition-en">{sense.definition}</p>}
                  {sense.example && <p className="sense-example">{sense.example}</p>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
