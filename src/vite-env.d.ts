/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SEOUL_DATA_SERVICE_KEY_ENCODING: string;
  readonly VITE_SEOUL_DATA_SERVICE_KEY_DECODING: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
