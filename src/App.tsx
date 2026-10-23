import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  beginDropboxAuthorization,
  finishDropboxAuthorization,
  hasDropboxAppKey,
  isDropboxConnected,
  syncDropboxFile,
} from "./dropbox";
import { createNote, getStoredNotes, mergeNotes, parseNotes, type Note } from "./notes";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
});

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "发生未知错误，请稍后重试。";
}

export function App() {
  const [initialState] = useState(() => {
    try {
      return { notes: getStoredNotes(), error: "" };
    } catch (error) {
      return { notes: [], error: `无法读取本地笔记：${messageOf(error)}` };
    }
  });
  const [storageError, setStorageError] = useState(initialState.error);
  const [notes, setNotes] = useState<Note[]>(initialState.notes);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [status, setStatus] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [connected, setConnected] = useState(isDropboxConnected);
  const [isSyncing, setIsSyncing] = useState(false);

  const allTags = useMemo(
    () => [...new Set(notes.flatMap((note) => note.tags))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [notes],
  );
  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return notes.filter((note) => {
      const matchesTag = !activeTag || note.tags.includes(activeTag);
      const matchesQuery =
        !normalizedQuery ||
        note.content.toLocaleLowerCase().includes(normalizedQuery) ||
        note.tags.some((tag) => tag.toLocaleLowerCase().includes(normalizedQuery));
      return matchesTag && matchesQuery;
    });
  }, [activeTag, notes, query]);

  function persist(nextNotes: Note[]): boolean {
    try {
      localStorage.setItem("blomo.notes", JSON.stringify(nextNotes));
      setNotes(nextNotes);
      setStorageError("");
      return true;
    } catch (error) {
      setStorageError(`无法保存本地笔记：${messageOf(error)}`);
      return false;
    }
  }

  function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) {
      setStatus("先写下一点想法吧。");
      return;
    }
    if (!persist([createNote(draft), ...notes])) return;
    setDraft("");
    setActiveTag("");
    setStatus("记下来了。");
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function deleteNote(id: string) {
    if (persist(notes.filter((note) => note.id !== id))) setStatus("笔记已删除。");
  }

  async function connectDropbox() {
    try {
      await beginDropboxAuthorization();
      setStatus("已打开 Dropbox 授权页面；授权后将授权码粘贴到设置中。");
    } catch (error) {
      setStatus(messageOf(error));
    }
  }

  async function submitAuthorizationCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await finishDropboxAuthorization(authorizationCode);
      setConnected(true);
      setAuthorizationCode("");
      setStatus("Dropbox 已连接。");
    } catch (error) {
      setStatus(messageOf(error));
    }
  }

  async function syncNotes() {
    setIsSyncing(true);
    setStatus("");
    try {
      const synced = await syncDropboxFile(notes, (remoteValue) =>
        mergeNotes(notes, parseNotes(remoteValue)),
      );
      if (!persist(synced)) return;
      setConnected(true);
      setStatus(`同步完成，共 ${synced.length} 条笔记。`);
    } catch (error) {
      setStatus(messageOf(error));
    } finally {
      setIsSyncing(false);
    }
  }

  function disconnectDropbox() {
    localStorage.removeItem("blomo.dropbox.refresh_token");
    setConnected(false);
    setStatus("已断开 Dropbox 连接。");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="./" aria-label="Blomo 首页">
          <span className="brand-mark">b.</span>
          <span>blomo</span>
        </a>
        <div className="topbar-actions">
          <button
            className={`sync-button${isSyncing ? " is-syncing" : ""}`}
            onClick={() => void syncNotes()}
            disabled={!connected || isSyncing}
            title={connected ? "与 Dropbox 同步" : "先在设置中连接 Dropbox"}
          >
            <span aria-hidden="true">↻</span>
            <span>{isSyncing ? "同步中" : "同步"}</span>
          </button>
          <button className="icon-button settings-button" onClick={() => setSettingsOpen(true)} aria-label="设置">
            <span aria-hidden="true">⚙</span>
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading">你的空间</div>
          <button
            className={`nav-item${!activeTag ? " is-active" : ""}`}
            onClick={() => setActiveTag("")}
          >
            <span className="nav-icon" aria-hidden="true">▤</span>
            <span>所有笔记</span>
            <span className="nav-count">{notes.length}</span>
          </button>
          <div className="tag-heading">
            <span>标签</span>
            <span className="tag-hash">#</span>
          </div>
          <div className="tag-list">
            {allTags.map((tag) => (
              <button
                className={`tag-nav-item${activeTag === tag ? " is-active" : ""}`}
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? "" : tag)}
              >
                <span className="tag-dot" />
                <span>{tag}</span>
                <span className="nav-count">{notes.filter((note) => note.tags.includes(tag)).length}</span>
              </button>
            ))}
            {allTags.length === 0 && <p className="sidebar-hint">在笔记中写 #标签 来整理想法</p>}
          </div>
          <div className="sidebar-footer">
            <span className={`connection-dot${connected ? " is-connected" : ""}`} />
            <span>{connected ? "Dropbox 已连接" : "仅保存在此设备"}</span>
          </div>
        </aside>

        <section className="notes-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">轻一点，记下来</p>
              <h1>{activeTag ? `#${activeTag}` : "随手记"}</h1>
              <p className="date-line">{dateFormatter.format(new Date())} · {notes.length} 条想法</p>
            </div>
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索笔记..."
                aria-label="搜索笔记"
              />
              {query && (
                <button className="clear-search" onClick={() => setQuery("")} aria-label="清除搜索">
                  ×
                </button>
              )}
            </label>
          </div>

          <form className="composer" onSubmit={addNote}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleEditorKeyDown}
              placeholder="此刻有什么想法？写下来…&#10;&#10;用 #标签 整理你的灵感"
              aria-label="写一条新笔记"
              rows={4}
            />
            <div className="composer-footer">
              <span>⌘ / Ctrl + Enter 保存</span>
              <button type="submit" className="save-button">
                <span aria-hidden="true">↗</span> 记下来
              </button>
            </div>
          </form>

          <div className="list-heading">
            <span>{query || activeTag ? "筛选结果" : "最近记录"}</span>
            <span className="result-count">{filteredNotes.length} 条</span>
          </div>

          <div className="note-list">
            {filteredNotes.map((note) => (
              <article className="note-card" key={note.id}>
                <div className="note-meta">
                  <time dateTime={note.createdAt}>
                    {new Intl.DateTimeFormat("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(note.createdAt))}
                  </time>
                  <button className="delete-button" onClick={() => deleteNote(note.id)} aria-label="删除笔记">
                    ×
                  </button>
                </div>
                <p className="note-content">{note.content}</p>
                {note.tags.length > 0 && (
                  <div className="note-tags">
                    {note.tags.map((tag) => (
                      <button key={tag} onClick={() => setActiveTag(tag)}>#{tag}</button>
                    ))}
                  </div>
                )}
              </article>
            ))}
            {filteredNotes.length === 0 && (
              <div className="empty-state">
                <span aria-hidden="true">{query || activeTag ? "⌕" : "✳"}</span>
                <p>{query || activeTag ? "没有找到匹配的笔记" : "这里还很安静，写下第一条想法吧"}</p>
                {(query || activeTag) && (
                  <button onClick={() => { setQuery(""); setActiveTag(""); }}>清除筛选</button>
                )}
              </div>
            )}
          </div>
        </section>
      </section>

      {(status || storageError) && (
        <div className={`status-message${storageError ? " is-error" : ""}`} role="status">
          {storageError || status}
          <button onClick={() => { setStatus(""); setStorageError(""); }} aria-label="关闭提示">×</button>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSettingsOpen(false);
        }}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">设备与同步</p>
                <h2 id="settings-title">设置</h2>
              </div>
              <button className="icon-button close-button" onClick={() => setSettingsOpen(false)} aria-label="关闭设置">×</button>
            </div>
            <div className="settings-section">
              <div className="dropbox-brand">
                <span className="dropbox-icon" aria-hidden="true">▦</span>
                <div>
                  <strong>Dropbox 同步</strong>
                  <p>{connected ? "笔记可以在不同设备间合并同步。" : "连接自己的 Dropbox，安全保存一份云端副本。"}</p>
                </div>
              </div>
              {!hasDropboxAppKey() ? (
                <div className="setup-notice">
                  <strong>需要配置 Dropbox App Key</strong>
                  <p>在项目根目录的 <code>.env.local</code> 中设置 <code>VITE_DROPBOX_APP_KEY</code>，然后重启或重新构建应用。</p>
                </div>
              ) : connected ? (
                <div className="connected-actions">
                  <span className="connected-label"><span className="connection-dot is-connected" /> 已连接</span>
                  <button className="text-button" onClick={disconnectDropbox}>断开连接</button>
                </div>
              ) : (
                <>
                  <button className="connect-button" onClick={() => void connectDropbox()}>
                    连接 Dropbox <span aria-hidden="true">↗</span>
                  </button>
                  {authorizationCode.length > 0 || localStorage.getItem("blomo.dropbox.pkce_verifier") ? (
                    <form className="code-form" onSubmit={(event) => void submitAuthorizationCode(event)}>
                      <label htmlFor="authorization-code">授权后粘贴 Dropbox 显示的授权码</label>
                      <input
                        id="authorization-code"
                        value={authorizationCode}
                        onChange={(event) => setAuthorizationCode(event.target.value)}
                        placeholder="授权码"
                        autoComplete="off"
                      />
                      <button className="save-button" type="submit" disabled={!authorizationCode.trim()}>
                        完成连接
                      </button>
                    </form>
                  ) : null}
                </>
              )}
              <p className="privacy-note">笔记只存在于本机和你自己的 Dropbox App 文件夹中。刷新令牌保存在本机。</p>
            </div>
            <div className="settings-bottom">
              <span>Blomo · 轻量笔记</span>
              <span>本地优先</span>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
