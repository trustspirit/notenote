import type { MindNode } from "./mindmap";

export type NoteKind = "text" | "mindmap";

export interface Notebook {
  id: string;
  name: string;
  isPublic: boolean;
  createdAt: number;
}

export interface Note {
  id: string;
  notebookId: string;
  title: string;
  contentHtml: string;
  tags: string[];
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
  aiOrganizedAt?: number;
  /** Missing on notes created before mind maps existed: treat as "text". */
  kind?: NoteKind;
  /** Source of truth for mind-map notes; contentHtml then holds its outline. */
  mindmap?: MindNode[];
}

/** What a visitor sees: a read-only snapshot, stripped of private fields. */
export interface PublicNote {
  id: string;
  ownerUid: string;
  authorName: string;
  title: string;
  contentHtml: string;
  tags: string[];
  updatedAt: number;
  kind?: NoteKind;
  mindmap?: MindNode[];
}

/** A row of a shared notebook's note list (kept on the notebook doc by Cloud Functions). */
export interface PublicNoteSummary {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  updatedAt: number;
  kind: NoteKind;
}

export interface PublicNotebook {
  id: string;
  ownerUid: string;
  authorName: string;
  name: string;
  updatedAt: number;
  /** Newest first. Missing only for a moment while the mirror is being built. */
  notes?: PublicNoteSummary[];
}

export interface OrganizeResult {
  title: string;
  html: string;
  tags: string[];
  summary: string;
}
