export interface Note {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

const TAG_PATTERN = /#([\p{L}\p{N}_-]+)/gu;

export function getTags(content: string): string[] {
  return [...new Set(Array.from(content.matchAll(TAG_PATTERN), (match) => match[1]))];
}

export function createNote(content: string): Note {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    content: content.trim(),
    tags: getTags(content),
    createdAt: now,
    updatedAt: now,
  };
}

export function parseNotes(value: unknown): Note[] {
  if (!Array.isArray(value)) throw new Error("Dropbox 中的笔记文件格式不正确。");

  return value.map((item: unknown) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      typeof item.id !== "string" ||
      !("content" in item) ||
      typeof item.content !== "string" ||
      !("createdAt" in item) ||
      typeof item.createdAt !== "string" ||
      !("updatedAt" in item) ||
      typeof item.updatedAt !== "string"
    ) {
      throw new Error("Dropbox 中包含无效笔记，未应用同步结果。");
    }
    return {
      id: item.id,
      content: item.content,
      tags: getTags(item.content),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });
}

export function mergeNotes(localNotes: Note[], remoteNotes: Note[]): Note[] {
  const byId = new Map<string, Note>();
  for (const note of [...localNotes, ...remoteNotes]) {
    const current = byId.get(note.id);
    if (!current || note.updatedAt > current.updatedAt) byId.set(note.id, note);
  }
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getStoredNotes(): Note[] {
  const raw = localStorage.getItem("blomo.notes");
  if (!raw) return [];
  return parseNotes(JSON.parse(raw) as unknown);
}
