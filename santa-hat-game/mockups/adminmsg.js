// The exact text Cody's wallet signs for an admin action. Shared by the admin screen (admin.js) and the server
// (server/admin.js), so the two can never disagree about it.
export function adminMessage({ action, game, settings = {}, at, nonce }) {
  return ['Santa Hat Legends admin', `action: ${action}`, `game: ${game}`, `settings: ${JSON.stringify(settings)}`, `at: ${at}`, `nonce: ${nonce}`].join('\n');
}
