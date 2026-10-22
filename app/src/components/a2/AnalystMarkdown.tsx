"use client";

import type { ReactNode } from "react";

type Block =
  | { type: "paragraph"; text: string }
  | { type: "ul" | "ol"; items: string[] };

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: Extract<Block, { type: "ul" | "ol" }> | null = null;

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    paragraph = [];
    if (text) blocks.push({ type: "paragraph", text });
  };

  const flushList = () => {
    if (list?.items.length) blocks.push(list);
    list = null;
  };

  for (const rawLine of source.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const type = unordered ? "ul" : "ol";
      const item = (unordered ?? ordered)![1];
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [item] };
      } else {
        list.items.push(item);
      }
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let plain = "";
  let index = 0;

  const flush = () => {
    if (!plain) return;
    nodes.push(plain);
    plain = "";
  };

  for (let cursor = 0; cursor < text.length; ) {
    if (text.startsWith("**", cursor) || text.startsWith("__", cursor)) {
      const marker = text.slice(cursor, cursor + 2);
      const end = text.indexOf(marker, cursor + 2);
      if (end !== -1) {
        flush();
        nodes.push(
          <strong key={`${keyPrefix}-strong-${index++}`} className="font-semibold">
            {text.slice(cursor + 2, end)}
          </strong>
        );
        cursor = end + 2;
        continue;
      }
    }

    if (text[cursor] === "`") {
      const end = text.indexOf("`", cursor + 1);
      if (end !== -1) {
        flush();
        nodes.push(
          <code
            key={`${keyPrefix}-code-${index++}`}
            className="mono rounded bg-[var(--surface-sunk)] px-1 py-0.5 text-[0.92em]"
          >
            {text.slice(cursor + 1, end)}
          </code>
        );
        cursor = end + 1;
        continue;
      }
    }

    plain += text[cursor];
    cursor += 1;
  }

  flush();
  return nodes;
}

export function AnalystMarkdown({
  text,
  className = "space-y-3 text-[13px] leading-6",
}: {
  text: string;
  className?: string;
}) {
  const blocks = parseBlocks(text);
  if (!blocks.length) return null;

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.type === "paragraph") {
          return <p key={index}>{renderInline(block.text, `p-${index}`)}</p>;
        }
        const List = block.type === "ul" ? "ul" : "ol";
        return (
          <List
            key={index}
            className={`${block.type === "ul" ? "list-disc" : "list-decimal"} space-y-1.5 pl-5`}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInline(item, `${block.type}-${index}-${itemIndex}`)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
