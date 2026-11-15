import type { RemoteFile } from "./plan";

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
/** Every file the backup creates carries this tag, so it can find them again. */
const APP_TAG = { app: "pensieve" };

/** The access token expired or was revoked: the user has to reconnect. */
export class DriveAuthError extends Error {}

type Props = Record<string, string>;

/**
 * Thin client over the Drive v3 REST API. With the `drive.file` scope it can
 * only see files this app created, never the rest of the user's Drive.
 */
export class DriveClient {
  constructor(private readonly token: string) {}

  private async call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${this.token}`, ...init.headers } });
    if (res.status === 401) throw new DriveAuthError("Google Drive 연결이 만료됐어요.");
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new Error(`Drive ${res.status}: ${body?.error?.message ?? res.statusText}`);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  /** All live (non-trashed) files the backup made. */
  async listAppFiles(): Promise<RemoteFile[]> {
    const q = "appProperties has { key='app' and value='pensieve' } and trashed = false";
    const files: RemoteFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q, pageSize: "1000", spaces: "drive",
        fields: "nextPageToken,files(id,name,appProperties)",
        ...(pageToken && { pageToken }),
      });
      const page = await this.call<{ files: RemoteFile[]; nextPageToken?: string }>(`${API}?${params}`);
      files.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return files;
  }

  async createFolder(name: string, parent: string | null, props: Props): Promise<string> {
    const meta = { name, mimeType: FOLDER_MIME, appProperties: { ...APP_TAG, ...props }, ...(parent && { parents: [parent] }) };
    const res = await this.call<{ id: string }>(`${API}?fields=id`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta),
    });
    return res.id;
  }

  async rename(fileId: string, name: string) {
    await this.call(`${API}/${fileId}?fields=id`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
  }

  async trash(fileId: string) {
    await this.call(`${API}/${fileId}?fields=id`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
    });
  }

  /** Create (no fileId) or overwrite a Markdown file, optionally moving it between folders. */
  async uploadMarkdown(opts: {
    fileId?: string; name: string; content: string; props: Props; parent: string; previousParent?: string;
  }): Promise<string> {
    const meta: Record<string, unknown> = { name: opts.name, mimeType: "text/markdown", appProperties: { ...APP_TAG, ...opts.props } };
    if (!opts.fileId) meta.parents = [opts.parent];
    const boundary = `pensieve-${crypto.randomUUID()}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n${opts.content}\r\n--${boundary}--`;
    const params = new URLSearchParams({ uploadType: "multipart", fields: "id" });
    if (opts.fileId && opts.previousParent && opts.previousParent !== opts.parent) {
      params.set("addParents", opts.parent);
      params.set("removeParents", opts.previousParent);
    }
    const url = opts.fileId ? `${UPLOAD}/${opts.fileId}?${params}` : `${UPLOAD}?${params}`;
    const res = await this.call<{ id: string }>(url, {
      method: opts.fileId ? "PATCH" : "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    return res.id;
  }
}

export const driveFolderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
