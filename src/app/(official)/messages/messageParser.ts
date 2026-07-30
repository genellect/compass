export type MessageBlock = {
  kind: "paragraph" | "pull-quote" | "signature";
  text: string;
};

export type MessageChapter = {
  id: string;
  kind: "chapter" | "epilogue";
  title: string;
  blocks: MessageBlock[];
};

export type MessageDocument = {
  title: string;
  chapters: MessageChapter[];
};

const chapterIds = [
  "ai-as-a-team-member",
  "no-time-to-think",
  "effort-is-not-a-receipt",
  "ai-makes-mistakes",
  "polished-mistakes",
  "between-science-and-development",
  "ai-did-not-do-everything",
  "humans-make-the-bet",
  "using-ai-is-not-the-point",
  "skills-for-the-future",
  "five-years-from-now",
  "epilogue"
] as const;

function blockKind(text: string, chapterKind: MessageChapter["kind"]): MessageBlock["kind"] {
  if (chapterKind === "epilogue" && text === "Yuto Matsui\n創設者・代表\nCOMPASS") return "signature";
  if (/^\*\*[\s\S]+\*\*$/.test(text)) return "pull-quote";
  return "paragraph";
}

export function parseMessageMarkdown(source: string): MessageDocument {
  const lines = source.replace(/\r\n/g, "\n").trim().split("\n");
  let title = "";
  const chapters: MessageChapter[] = [];
  let current: MessageChapter | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!current || !paragraph.length) return;
    const text = paragraph.join("\n");
    current.blocks.push({ kind: blockKind(text, current.kind), text });
    paragraph = [];
  };

  for (const line of lines) {
    if (line === "---") {
      flushParagraph();
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      const heading = line.slice(2);
      if (!title) {
        title = heading;
        continue;
      }
      current = {
        id: chapterIds[chapters.length] ?? `chapter-${chapters.length + 1}`,
        kind: "epilogue",
        title: heading,
        blocks: []
      };
      chapters.push(current);
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      current = {
        id: chapterIds[chapters.length] ?? `chapter-${chapters.length + 1}`,
        kind: "chapter",
        title: line.slice(3),
        blocks: []
      };
      chapters.push(current);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    if (!current) throw new Error("Message copy must start with a title and a chapter heading.");
    paragraph.push(line);
  }

  flushParagraph();

  if (!title) throw new Error("Message copy is missing its title.");
  if (chapters.length !== chapterIds.length) {
    throw new Error(`Message copy must contain ${chapterIds.length} chapters; found ${chapters.length}.`);
  }
  if (chapters.at(-1)?.kind !== "epilogue") throw new Error("Message copy is missing its epilogue.");

  return { title, chapters };
}

export function stripMessageMarkdown(source: string) {
  return source
    .replace(/\r\n/g, "\n")
    .replace(/^---\s*$/gm, "")
    .replace(/^#{1,2}\s+/gm, "")
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
