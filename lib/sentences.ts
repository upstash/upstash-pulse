export type Sentence = { start: number; end: number; text: string };

const MAX_SENTENCES = 8;
const MIN_CHARS = 12;

/**
 * Splits a post into sentence-ish spans, keeping offsets so the UI can underline the
 * original text. Splits on sentence punctuation and line breaks; URLs stay intact
 * because there is no whitespace inside them.
 */
export function splitSentences(text: string): Sentence[] {
  const parts: Sentence[] = [];
  // `m` matters: a line that ends without punctuation still ends a sentence.
  const re = /[^\n]+?(?:[.!?…]+(?=\s|$)|$)/gym;
  let pos = 0;
  while (pos < text.length) {
    if (text[pos] === "\n") {
      pos++;
      continue;
    }
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m) break;
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const start = pos + lead;
    const end = pos + raw.trimEnd().length;
    if (end > start) parts.push({ start, end, text: text.slice(start, end) });
    pos = pos + raw.length;
  }

  // Merge fragments that are too short to stand on their own ("Nice.", a bare @mention, an emoji).
  const merged: Sentence[] = [];
  for (const p of parts) {
    const prev = merged[merged.length - 1];
    const stub = p.text.replace(/https?:\/\/\S+/g, "").replace(/[@#]\w+/g, "").trim().length < MIN_CHARS;
    if (prev && stub) {
      prev.end = p.end;
      prev.text = text.slice(prev.start, prev.end);
    } else {
      merged.push({ ...p });
    }
  }
  // A trailing stub merged backwards; a leading one can still be too short on its own.
  while (merged.length > 1 && merged[0].text.trim().length < MIN_CHARS) {
    merged[1].start = merged[0].start;
    merged[1].text = text.slice(merged[1].start, merged[1].end);
    merged.shift();
  }
  return merged.slice(0, MAX_SENTENCES);
}
