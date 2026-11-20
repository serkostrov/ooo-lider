import type { ReactNode } from "react";

export type MentionQuery = { start: number; query: string } | null;

export function detectMention(text: string, caret: number): MentionQuery {
  const before = text.slice(0, caret);
  const m = before.match(/(^|[\s\n])@([^\s@]*)$/);
  if (!m) return null;
  const query = m[2] ?? "";
  const start = before.length - query.length - 1;
  return { start, query };
}

export function renderMentionBody(body: string, mentionName: string | null) {
  if (!mentionName) return body;
  const tag = `@${mentionName}`;
  const idx = body.indexOf(tag);
  if (idx < 0) return body;
  return (
    <>
      {body.slice(0, idx)}
      <span className="rounded bg-primary/15 px-1 font-medium text-primary">{tag}</span>
      {body.slice(idx + tag.length)}
    </>
  );
}

/** Подсветка @тега синим в поле ввода (поверх прозрачного textarea). */
export function highlightComposer(text: string, mentionName: string | null): ReactNode {
  if (!text) return "\u00a0";
  const tag = mentionName ? `@${mentionName}` : null;
  if (!tag || !text.includes(tag)) {
    return text.endsWith("\n") ? `${text}\u00a0` : text;
  }
  const parts: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length) {
    const idx = rest.indexOf(tag);
    if (idx < 0) {
      parts.push(<span key={key++}>{rest}</span>);
      break;
    }
    if (idx > 0) parts.push(<span key={key++}>{rest.slice(0, idx)}</span>);
    parts.push(
      <span key={key++} className="rounded-sm bg-primary/15 font-medium text-primary">
        {tag}
      </span>,
    );
    rest = rest.slice(idx + tag.length);
  }
  if (text.endsWith("\n")) parts.push("\u00a0");
  return parts;
}
