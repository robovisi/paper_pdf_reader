import type {
  DictionaryEntry,
  DictionarySense,
  OfflineDictionaryRecord,
} from "../types";

const LOCAL_DICTIONARY: Record<string, DictionaryEntry> = {
  ablation: {
    word: "ablation",
    lemma: "ablation",
    phonetic: "/əˈbleɪʃən/",
    source: "local",
    senses: [{
      partOfSpeech: "noun",
      definition: "The removal of a component to measure its contribution to a system.",
      definitionZh: "消融；通过移除模型组件来评估其贡献的实验方法。",
    }],
  },
  constrain: {
    word: "constrain",
    lemma: "constrain",
    phonetic: "/kənˈstreɪn/",
    source: "local",
    senses: [{
      partOfSpeech: "verb",
      definition: "To limit the scope, extent, or activity of something.",
      definitionZh: "限制；约束。",
    }],
  },
  empirical: {
    word: "empirical",
    lemma: "empirical",
    phonetic: "/ɪmˈpɪrɪkəl/",
    source: "local",
    senses: [{
      partOfSpeech: "adjective",
      definition: "Based on observation or experiment rather than theory alone.",
      definitionZh: "经验性的；以观察或实验为依据的。",
    }],
  },
  inference: {
    word: "inference",
    lemma: "inference",
    phonetic: "/ˈɪnfərəns/",
    source: "local",
    senses: [{
      partOfSpeech: "noun",
      definition: "A conclusion reached from evidence and reasoning.",
      definitionZh: "推断；由证据和推理得出的结论。",
    }],
  },
  latent: {
    word: "latent",
    lemma: "latent",
    phonetic: "/ˈleɪtənt/",
    source: "local",
    senses: [{
      partOfSpeech: "adjective",
      definition: "Present but not directly observable.",
      definitionZh: "潜在的；存在但不能被直接观测的。",
    }],
  },
  robust: {
    word: "robust",
    lemma: "robust",
    phonetic: "/rəʊˈbʌst/",
    source: "local",
    senses: [{
      partOfSpeech: "adjective",
      definition: "Able to remain effective under varying or adverse conditions.",
      definitionZh: "稳健的；在条件变化或受到扰动时仍能保持有效的。",
    }],
  },
  regularization: {
    word: "regularization",
    lemma: "regularization",
    phonetic: "/ˌreɡjʊləraɪˈzeɪʃən/",
    source: "local",
    senses: [{
      partOfSpeech: "noun",
      definition: "A technique that discourages overly complex models to improve generalization.",
      definitionZh: "正则化；通过限制模型复杂度来改善泛化能力的方法。",
    }],
  },
};

const IRREGULAR_FORMS: Record<string, string> = {
  analyses: "analysis",
  matrices: "matrix",
  criteria: "criterion",
  hypotheses: "hypothesis",
};

function normalize(text: string) {
  return text
    .normalize("NFKC")
    .replace(/([a-z])-\s+([a-z])/gi, "$1$2")
    .replace(/^[^a-z]+|[^a-z-]+$/gi, "")
    .toLowerCase();
}

function candidates(word: string) {
  const values = [word];
  if (IRREGULAR_FORMS[word]) values.push(IRREGULAR_FORMS[word]);
  if (word.endsWith("ies")) values.push(`${word.slice(0, -3)}y`);
  if (word.endsWith("ing")) values.push(word.slice(0, -3), `${word.slice(0, -3)}e`);
  if (word.endsWith("ed")) values.push(word.slice(0, -2), word.slice(0, -1));
  if (word.endsWith("s") && !word.endsWith("ss")) values.push(word.slice(0, -1));
  return [...new Set(values)].filter(Boolean);
}

type DictionaryShard = Record<string, OfflineDictionaryRecord>;

const shardCache = new Map<string, Promise<DictionaryShard>>();
const SHARD_CACHE_LIMIT = 8;
const PARTS_OF_SPEECH = new Set([
  "adj", "adv", "art", "aux", "conj", "int", "n", "num", "prep", "pron", "v", "vi", "vt",
]);

function dictionaryShardName(word: string) {
  return word.slice(0, 2).padEnd(2, "_").replace(/[^a-z0-9]/g, "_");
}

async function loadBrowserShard(name: string, signal?: AbortSignal) {
  const cached = shardCache.get(name);
  if (cached) {
    shardCache.delete(name);
    shardCache.set(name, cached);
    return cached;
  }

  const pending = fetch(`${import.meta.env.BASE_URL}dictionary/${name}.json`, { signal })
    .then(async (response) => {
      if (response.status === 404) return {};
      if (!response.ok) throw new Error(`Unable to load dictionary shard: ${response.status}`);
      return await response.json() as DictionaryShard;
    })
    .catch((error) => {
      shardCache.delete(name);
      throw error;
    });

  if (shardCache.size >= SHARD_CACHE_LIMIT) {
    const oldest = shardCache.keys().next().value;
    if (oldest) shardCache.delete(oldest);
  }
  shardCache.set(name, pending);
  return pending;
}

async function lookupOfflineRecord(word: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Lookup canceled", "AbortError");
  if (window.paperReader) return await window.paperReader.lookupDictionary(word);
  const shard = await loadBrowserShard(dictionaryShardName(word), signal);
  return Object.hasOwn(shard, word) ? shard[word] : null;
}

function parseSenseLine(value: string) {
  const line = value.trim();
  const match = /^([a-z]{1,5})\.?\s+(.+)$/i.exec(line);
  if (!match || !PARTS_OF_SPEECH.has(match[1].toLowerCase())) {
    return { partOfSpeech: "", text: line };
  }
  return { partOfSpeech: `${match[1].toLowerCase()}.`, text: match[2].trim() };
}

function parseSenseLines(value: string, mergeContinuations = false) {
  const senses: Array<{ partOfSpeech: string; text: string }> = [];
  for (const valueLine of value.split(/\\n|\r?\n/)) {
    const item = parseSenseLine(valueLine);
    if (!item.text) continue;
    if (mergeContinuations && !item.partOfSpeech && senses.length > 0) {
      senses[senses.length - 1].text += ` ${item.text}`;
    } else {
      senses.push(item);
    }
  }
  return senses;
}

function buildSenses(definition: string, translation: string): DictionarySense[] {
  const english = parseSenseLines(definition, true);
  const chinese = parseSenseLines(translation);
  const length = Math.min(5, Math.max(english.length, chinese.length));
  const senses: DictionarySense[] = [];

  for (let index = 0; index < length; index += 1) {
    const englishSense = english[index];
    const chineseSense = chinese[index];
    senses.push({
      partOfSpeech: chineseSense?.partOfSpeech || englishSense?.partOfSpeech || "",
      definition: englishSense?.text ?? "",
      definitionZh: chineseSense?.text,
    });
  }
  return senses;
}

function extractLemma(word: string, exchange: string) {
  const lemma = exchange
    .split("/")
    .find((value) => value.startsWith("0:"))
    ?.slice(2)
    .trim();
  return lemma || word;
}

function formatPhonetic(value: string) {
  const phonetic = value.trim();
  if (!phonetic || phonetic.startsWith("/") || phonetic.startsWith("[")) return phonetic;
  return `/${phonetic}/`;
}

function toDictionaryEntry(selectedWord: string, record: OfflineDictionaryRecord): DictionaryEntry {
  const [word, phonetic, definition, translation, , exchange] = record;
  return {
    word: selectedWord,
    lemma: extractLemma(word, exchange),
    phonetic: formatPhonetic(phonetic),
    source: "local",
    sourceName: "ECDICT 离线词典",
    senses: buildSenses(definition, translation),
  };
}

export async function lookupDictionary(
  rawText: string,
  signal?: AbortSignal,
): Promise<DictionaryEntry | null> {
  const normalized = normalize(rawText);
  if (!normalized || normalized.length > 80) return null;

  for (const candidate of candidates(normalized)) {
    if (LOCAL_DICTIONARY[candidate]) {
      return { ...LOCAL_DICTIONARY[candidate], word: normalized };
    }
  }

  for (const candidate of candidates(normalized)) {
    const record = await lookupOfflineRecord(candidate, signal);
    if (record) {
      const lemma = normalize(extractLemma(record[0], record[5]));
      if (!record[1] && lemma && lemma !== candidate) {
        const lemmaRecord = await lookupOfflineRecord(lemma, signal);
        if (lemmaRecord?.[1]) record[1] = lemmaRecord[1];
      }
      return toDictionaryEntry(normalized, record);
    }
  }
  return null;
}
