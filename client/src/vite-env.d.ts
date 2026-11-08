/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** "true" no build do Concord de testes (ver lib/staging.ts). */
  readonly VITE_STAGING?: string;
}

/** Hora em que esse build do client foi gerado (injetado pelo vite.config.ts). */
declare const __BUILD_TIME__: string;
/** Commit desse build (injetado pelo vite.config.ts; "dev" quando não dá para saber). */
declare const __COMMIT__: string;
