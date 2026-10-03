// BUILD CHECK (2026-10-03): the page and its code must come from the same publish. GitHub keeps every file cached up to 10
// minutes, so right after a publish a browser can hold the OLD page (online.html) while fetching NEW code; new code looking for
// a button the old page doesn't have can stop the game loading. deploy-pages.sh stamps the same build id here and on the
// page's <html data-build>, and adds ?v=<build> to every file the code loads (so the code itself is always one matching set).
// A mismatch reloads ONCE per build (a reload re-checks the page with GitHub); 'dev' (a local copy) never reloads.
// Imported FIRST by online.js, so this runs before any other game code.
export const BUILD = 'a80c15b94d';
const page = document.documentElement.dataset.build;
if (BUILD !== 'dev' && page && page !== BUILD) {
  try { if (sessionStorage.getItem('santa.buildReload') !== BUILD) { sessionStorage.setItem('santa.buildReload', BUILD); location.reload(); } } catch {}
}
