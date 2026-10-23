/// <reference types="vite/client" />

interface Window {
  blomo?: {
    openDropboxAuthorization: (url: string) => Promise<void>;
  };
}
