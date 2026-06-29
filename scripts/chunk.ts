/**
 * Heading-aware markdown chunking for the corpus.
 *
 * Two strategies, selected by the CHUNK_STRATEGY env var so S6 can A/B them with a
 * clean re-ingest (both stay reproducible):
 *
 *  - "baseline" (S2): parse front-matter, split the body on `##` (h2) headings, window
 *    oversized sections. Keeps a leading pre-h2 chunk even when it is header-only —
 *    which is the S5 failure mode (the bare "Work Experience" header chunk out-ranked
 *    the company details).
 *  - "v2" (S6, default): same heading-aware split, plus two fixes aimed squarely at the
 *    S5 retrieval failures —
 *      (1) DROP header-only chunks (a section whose body is just its heading / a stub),
 *          so "# Work Experience" can no longer out-rank real detail chunks;
 *      (2) PREFIX each chunk with its heading path ("<section> › <heading>") so the
 *          embedding (and the keyword index) carry the section + document subject, and
 *          detail chunks surface for category queries ("what companies…", "databases…").
 *
 * Token counts are approximated as chars/4 — good enough to bound chunk size for
 * a corpus this small; we never need exact tokenization here.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const MAX_TOKENS = 700; // target ceiling per chunk
export const OVERLAP_TOKENS = 100; // ~15% overlap when a section must be split
const CHARS_PER_TOKEN = 4;

/** Chunking strategy — "v2" (S6 default) or "baseline" (reproduces the S5 baseline). */
export const CHUNK_STRATEGY = process.env.CHUNK_STRATEGY ?? "v2";

/**
 * v2 only: a section whose body (heading stripped, whitespace removed) is shorter than
 * this is treated as header-only and dropped — it carries no answerable facts and only
 * pollutes retrieval (the S5 "Work Experience" header chunk).
 */
const MIN_BODY_CHARS = 40;

export interface Chunk {
  content: string;
  metadata: {
    sourceFile: string; // e.g. "experience.md"
    title: string; // front-matter title
    source: string; // front-matter source URL (citation link target)
    section: string; // front-matter section label
    heading: string; // the h2 heading this chunk came from (or the doc title)
    chunkIndex: number; // ordinal within the source file
    charStart: number; // char offset of the chunk within the file body
    charEnd: number;
  };
}

interface FrontMatter {
  title: string;
  source: string;
  section: string;
}

function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Parse leading `---`-delimited front-matter; return it plus the remaining body. */
function parseFrontMatter(raw: string): { fm: FrontMatter; body: string; bodyOffset: number } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const fm: FrontMatter = { title: "", source: "", section: "" };
  if (!match) {
    return { fm, body: raw, bodyOffset: 0 };
  }
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      const key = kv[1] as keyof FrontMatter;
      if (key in fm) fm[key] = kv[2].trim();
    }
  }
  return { fm, body: raw.slice(match[0].length), bodyOffset: match[0].length };
}

/**
 * Split a markdown body into sections at h2 (`## `) boundaries. Content before the
 * first h2 (the h1 + intro) becomes its own leading section.
 */
function splitSections(body: string): { heading: string; text: string; offset: number }[] {
  const lines = body.split("\n");
  const sections: { heading: string; text: string; offset: number }[] = [];
  let current: { heading: string; lines: string[]; offset: number } | null = null;
  let offset = 0;

  const flush = () => {
    if (current && current.lines.join("\n").trim()) {
      sections.push({ heading: current.heading, text: current.lines.join("\n").trim(), offset: current.offset });
    }
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    if (h2) {
      flush();
      current = { heading: h2[1].trim(), lines: [line], offset };
    } else {
      if (!current) current = { heading: h1 ? h1[1].trim() : "", lines: [], offset };
      current.lines.push(line);
    }
    offset += line.length + 1; // +1 for the stripped "\n"
  }
  flush();
  return sections;
}

/** Window an oversized section into overlapping paragraph-aligned slices. */
function windowSection(text: string): string[] {
  if (approxTokens(text) <= MAX_TOKENS) return [text];
  const maxChars = MAX_TOKENS * CHARS_PER_TOKEN;
  const overlapChars = OVERLAP_TOKENS * CHARS_PER_TOKEN;
  const paragraphs = text.split(/\n\n+/);
  const windows: string[] = [];
  let buf = "";

  for (const para of paragraphs) {
    if (buf && (buf.length + 2 + para.length) > maxChars) {
      windows.push(buf.trim());
      // carry the tail of the previous window as overlap
      buf = buf.slice(Math.max(0, buf.length - overlapChars));
    }
    buf = buf ? `${buf}\n\n${para}` : para;
  }
  if (buf.trim()) windows.push(buf.trim());
  return windows;
}

/** Strip a single leading markdown heading line (e.g. `## Foo`) from a section's text. */
function stripLeadingHeading(text: string): string {
  return text.replace(/^#{1,6}\s+.*(?:\r?\n|$)/, "").replace(/^\s+/, "");
}

/** Non-whitespace length of a section's body (heading line removed). */
function bodyLength(sectionText: string): number {
  return stripLeadingHeading(sectionText).replace(/\s+/g, "").length;
}

/** "<section> › <heading>" prefix that gives each chunk its document + section subject. */
function headingPath(fm: FrontMatter, heading: string): string {
  const top = fm.section || fm.title;
  if (!heading || heading === fm.title) return top;
  return `${top} › ${heading}`;
}

/** Chunk a single markdown file into embed-ready chunks with citation metadata. */
export function chunkFile(filePath: string, fileName: string): Chunk[] {
  const raw = readFileSync(filePath, "utf8");
  const { fm, body, bodyOffset } = parseFrontMatter(raw);
  const sections = splitSections(body);
  const chunks: Chunk[] = [];
  let chunkIndex = 0;
  const v2 = CHUNK_STRATEGY !== "baseline";

  for (const section of sections) {
    // v2: drop header-only / stub sections so they can't out-rank real content.
    if (v2 && bodyLength(section.text) < MIN_BODY_CHARS) continue;

    // v2 windows the heading-stripped body and re-adds a clean heading-path prefix;
    // baseline windows the raw section text (heading line included) unchanged.
    const sourceText = v2 ? stripLeadingHeading(section.text) : section.text;
    const prefix = v2 ? `${headingPath(fm, section.heading)}\n\n` : "";

    for (const win of windowSection(sourceText)) {
      const content = `${prefix}${win}`;
      // Locate the window's body within the file for an honest-ish char range; the
      // prefix isn't in the source file, so fall back to the section offset for v2.
      const localStart = body.indexOf(win);
      const charStart = bodyOffset + (localStart >= 0 ? localStart : section.offset);
      chunks.push({
        content,
        metadata: {
          sourceFile: fileName,
          title: fm.title,
          source: fm.source,
          section: fm.section,
          heading: section.heading || fm.title,
          chunkIndex: chunkIndex++,
          charStart,
          charEnd: charStart + win.length,
        },
      });
    }
  }
  return chunks;
}

/** Chunk every `*.md` in a directory (excluding README/guide files). */
export function chunkCorpus(contentDir: string): Chunk[] {
  const files = readdirSync(contentDir)
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
    .sort();
  return files.flatMap((f) => chunkFile(join(contentDir, f), f));
}
