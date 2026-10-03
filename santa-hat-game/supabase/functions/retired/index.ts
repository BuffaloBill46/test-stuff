// RETIRED (mainnet launch, 2026-10-03): the game server moved to the Droplet (https://api.santahatgames.com, worker/games.mjs).
// Deployed in place of the old 'games' Edge Function and the 'ping' diagnostic. The old 'games' kept devnet settings while
// writing to the same database: after the switch to mainnet, anyone holding TEST SANTA could have bought plays through it and the
// mainnet worker would have paid them in REAL SANTA (security review, 2026-10-03). This touches nothing and says where to go.
// Never redeploy supabase/functions/games/ with test settings against this project.
Deno.serve(() => new Response(JSON.stringify({ error: 'this server moved to https://api.santahatgames.com' }), {
  status: 410, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
}));
