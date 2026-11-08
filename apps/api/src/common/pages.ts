/**
 * Cabeçalhos das poucas páginas HTML servidas pela API (revisão e exclusão de conta).
 * O script vem de um arquivo separado do mesmo servidor, então a CSP proíbe qualquer
 * script inline ou de outro domínio: mesmo que um texto do banco tivesse HTML, ele
 * não rodaria. E o conteúdo vindo do banco é sempre inserido como texto.
 */
export const PAGE_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** Estilo base compartilhado pelas páginas (cores do app, tema claro e escuro). */
export const PAGE_BASE_STYLE = `
:root{--bg:#F6F4EE;--fg:#18203A;--muted:#5A6175;--card:#fff;--line:#DDD8CC;--accent:#16255F;--ok:#2E7D3A;--bad:#B4233F;--gold:#E8B830}
@media (prefers-color-scheme:dark){:root{--bg:#0F1A45;--fg:#F3F1EA;--muted:#A9B4DB;--card:#16255F;--line:#33478F;--accent:#E8B830;--ok:#7CC48A;--bad:#FF8A9A}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
button,input,select,textarea{font:inherit}
:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
`;
