import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";

const APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY?.trim() ?? "";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const CONTENT_URL = "https://content.dropboxapi.com/2/files";
const VERIFIER_KEY = "blomo.dropbox.pkce_verifier";
const REFRESH_TOKEN_KEY = "blomo.dropbox.refresh_token";
const MAX_SYNC_ATTEMPTS = 3;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomString(length: number): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(length)));
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetchDropbox(url, init);
  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const parsed = JSON.parse(body) as { error_summary?: string };
      message = parsed.error_summary ?? body;
    } catch {
      // Keep the response body for non-JSON Dropbox errors.
    }
    throw new Error(`Dropbox 请求失败 (${response.status})：${message}`);
  }
  return (await response.json()) as T;
}

async function fetchDropbox(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("无法连接 Dropbox，请检查网络和应用的站点访问权限。");
    }
    throw error;
  }
}

export function hasDropboxAppKey(): boolean {
  return APP_KEY.length > 0;
}

export function isDropboxConnected(): boolean {
  return Boolean(localStorage.getItem(REFRESH_TOKEN_KEY));
}

export async function beginDropboxAuthorization(): Promise<void> {
  if (!APP_KEY) throw new Error("尚未配置 Dropbox App Key，请先设置 VITE_DROPBOX_APP_KEY。");

  const isNative = Capacitor.isNativePlatform();
  const isElectron = Boolean(window.blomo);
  const authWindow = isNative || isElectron ? null : window.open("about:blank", "_blank");
  if (!isNative && !isElectron && !authWindow) {
    throw new Error("授权窗口被浏览器拦截，请允许此应用打开新窗口后重试。");
  }

  const verifier = randomString(64);
  const challenge = encodeBase64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );
  localStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: APP_KEY,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    token_access_type: "offline",
  });
  const url = `https://www.dropbox.com/oauth2/authorize?${params}`;
  if (isNative) {
    await Browser.open({ url });
  } else if (window.blomo) {
    await window.blomo.openDropboxAuthorization(url);
  } else {
    if (!authWindow) throw new Error("无法打开 Dropbox 授权窗口，请重试。");
    authWindow.location.href = url;
  }
}

export async function finishDropboxAuthorization(code: string): Promise<void> {
  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!APP_KEY || !verifier) throw new Error("授权流程已过期，请重新连接 Dropbox。");

  const body = new URLSearchParams({
    code: code.trim(),
    grant_type: "authorization_code",
    client_id: APP_KEY,
    code_verifier: verifier,
  });
  const token = await request<TokenResponse>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!token.refresh_token) throw new Error("Dropbox 未返回刷新令牌，请检查应用权限和授权设置。");

  localStorage.setItem(REFRESH_TOKEN_KEY, token.refresh_token);
  localStorage.removeItem(VERIFIER_KEY);
}

async function getAccessToken(): Promise<string> {
  if (!APP_KEY) throw new Error("尚未配置 Dropbox App Key，请先设置 VITE_DROPBOX_APP_KEY。");
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) throw new Error("请先连接 Dropbox。");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: APP_KEY,
  });
  const token = await request<TokenResponse>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return token.access_token;
}

export async function syncDropboxFile<T>(
  localValue: T,
  merge: (remoteValue: unknown) => T,
): Promise<T> {
  const accessToken = await getAccessToken();
  for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt += 1) {
    let mergedValue = localValue;
    let revision: string | undefined;

    const downloaded = await fetchDropbox(`${CONTENT_URL}/download`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({ path: "/notes.json" }),
      },
    });
    if (downloaded.ok) {
      const metadata = downloaded.headers.get("Dropbox-API-Result");
      if (!metadata) throw new Error("Dropbox 未返回文件版本信息，无法安全合并同步。");
      const parsedMetadata: unknown = JSON.parse(metadata);
      if (
        typeof parsedMetadata !== "object" ||
        parsedMetadata === null ||
        !("rev" in parsedMetadata) ||
        typeof parsedMetadata.rev !== "string"
      ) {
        throw new Error("Dropbox 返回了无效的文件版本信息，无法安全合并同步。");
      }
      revision = parsedMetadata.rev;
      mergedValue = merge(await downloaded.json());
    } else {
      const body = await downloaded.text();
      if (downloaded.status !== 409 || !body.includes("path/not_found")) {
        throw new Error(`Dropbox 下载失败 (${downloaded.status})：${body}`);
      }
    }

    const uploaded = await fetchDropbox(`${CONTENT_URL}/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: "/notes.json",
          mode: revision ? { ".tag": "update", update: revision } : { ".tag": "add" },
          autorename: false,
          mute: true,
        }),
      },
      body: JSON.stringify(mergedValue),
    });
    if (uploaded.ok) return mergedValue;

    const body = await uploaded.text();
    if (uploaded.status === 409 && attempt < MAX_SYNC_ATTEMPTS - 1) continue;
    throw new Error(`Dropbox 上传失败 (${uploaded.status})：${body}`);
  }

  throw new Error("Dropbox 文件正在被其他设备更新，请稍后再同步。");
}
