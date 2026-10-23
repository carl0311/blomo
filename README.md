# Blomo

一个轻量、跨平台的 flomo 风格笔记应用：Windows 桌面端、Android 和 Chrome/Edge 扩展共用同一套界面与笔记数据格式。

## 功能

- 快速记录、浏览、搜索和删除笔记
- 自动识别 `#标签`，可按标签筛选
- 笔记保存在当前设备；可手动与 Dropbox 合并同步
- Dropbox 同步按笔记 ID 合并，冲突时保留更新时间较新的版本

Dropbox 同步是可选的。笔记内容保存在用户自己的 Dropbox App 文件夹中；Dropbox 刷新令牌保存在本机浏览器存储中。当前 MVP 不提供账号系统、端到端加密或设备间实时同步。

## 开发

需要 Node.js 20 或更新版本。

```sh
npm install
npm run dev
```

运行检查和生产构建：

```sh
npm run typecheck
npm run build
```

## Windows 桌面 EXE

```sh
npm run desktop:dev
npm run desktop:build
```

安装包输出到 `release/`。请在 Windows 上构建；Linux 交叉构建 Windows 安装包还需要 Wine。

## Android APK

需要 Android Studio、Android SDK 和 Java 17。

```sh
npm run android:add
npm run android:sync
npm run android:build
npm run android:open
```

`npm run android:build` 会构建可安装的 Debug APK，并输出到 `release/blomo-android.apk`。首次运行 `android:add` 后会生成 `android/` 原生项目；该目录不提交到版本库。

## Chrome / Edge 扩展

```sh
npm run extension:build
```

扩展文件会输出到 `release/extension/`。在浏览器扩展管理页开启开发者模式，选择“加载已解压的扩展程序”，然后选择该目录。Chrome 和 Edge 共用 Manifest V3 扩展。

## 配置 Dropbox

1. 在 [Dropbox App Console](https://www.dropbox.com/developers/apps) 创建一个 **Scoped access / App folder** 应用，并启用 `files.content.read` 和 `files.content.write` 权限。
2. 在项目根目录创建 `.env.local`，设置 `VITE_DROPBOX_APP_KEY=你的AppKey`，然后重新构建应用。浏览器扩展的 Dropbox API host permission 已在 `manifest.json` 配置。
3. 在应用中打开 Dropbox 设置，点击“连接 Dropbox”，在 Dropbox 页面授权后将显示的授权码粘贴回应用。
4. 点击“立即同步”。首次同步会创建 `Apps/<应用名>/notes.json`。

授权采用 PKCE；应用只保存 Dropbox 刷新令牌，不保存 Dropbox 密码。因 MVP 使用手动粘贴授权码，连接流程需要用户在 Dropbox 授权页与应用间切换一次。多设备同时更新时会基于 Dropbox 文件版本重试合并，避免直接覆盖并发新增的笔记。

## 技术栈

- Vite + React + TypeScript：共用 UI
- Electron：Windows 桌面封装
- Capacitor：Android 封装
- Manifest V3：Chrome/Edge 扩展
- Dropbox API：可选的手动云端同步
