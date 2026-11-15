/**
 * Drive access tokens via Google Identity Services. Firebase sign-in does not
 * give a refreshable Google token, so the backup asks for its own short-lived
 * token (about 1 hour) with only the `drive.file` scope.
 */

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GIS_SRC = "https://accounts.google.com/gsi/client";

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; scope?: string }
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void }
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient: (cfg: {
        client_id: string; scope: string; hint?: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type: string }) => void;
      }) => TokenClient;
      revoke: (token: string, done?: () => void) => void;
      hasGrantedAllScopes: (r: TokenResponse, scope: string) => boolean;
    };
  };
}
declare global { interface Window { google?: Gis } }

export const googleClientId: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;

let loading: Promise<Gis> | null = null;
function loadGis(): Promise<Gis> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  loading ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => (window.google ? resolve(window.google) : reject(new Error("Google 로그인 스크립트를 불러오지 못했어요.")));
    s.onerror = () => { loading = null; reject(new Error("Google 로그인 스크립트를 불러오지 못했어요.")); };
    document.head.appendChild(s);
  });
  return loading;
}

export interface DriveToken { value: string; expiresAt: number }

/** Preload so the later request runs inside the click handler (popup blockers). */
export function preloadGis() {
  if (googleClientId) void loadGis().catch(() => {});
}

/**
 * Must be called from a user gesture: it opens Google's consent popup the first
 * time, and a short-lived popup on later reconnects.
 */
export async function requestDriveToken(loginHint?: string): Promise<DriveToken> {
  if (!googleClientId) throw new Error("VITE_GOOGLE_CLIENT_ID가 설정되지 않았어요.");
  const gis = await loadGis();
  return new Promise((resolve, reject) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: DRIVE_SCOPE,
      hint: loginHint,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error("Google Drive 권한을 받지 못했어요."));
        if (!gis.accounts.oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE)) {
          return reject(new Error("Drive 파일 권한에 동의해야 백업할 수 있어요."));
        }
        // Renew a minute early so a sync never starts with a token about to expire.
        resolve({ value: r.access_token, expiresAt: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 });
      },
      error_callback: (e) =>
        reject(new Error(e.type === "popup_closed" ? "연결 창이 닫혔어요." : "Google 연결 창을 열지 못했어요. 팝업 차단을 확인하세요.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

export function revokeDriveToken(token: string) {
  window.google?.accounts.oauth2.revoke(token);
}
