// True only in the single-file preview build (npm run build:preview), which
// runs inside a sandboxed page: no service worker, notifications, downloads
// or install. The real app never ships this code path.
export const IS_PREVIEW = import.meta.env.VITE_PREVIEW === '1'
