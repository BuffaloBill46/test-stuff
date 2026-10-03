// JSON TO THE DATABASE (found 2026-10-03, live): postgres.js turns a JSON value we send as TEXT (JSON.stringify(...), which is
// how all our server code passes jsonb) into a quoted JSON *string*, so plays.result, pool_log.details, reward_claims.found and
// season_record's tasks were stored or read as strings (jackpot alerts and the jackpot banner never saw `jackpot`; the season
// refused every match: "bad tasks"). PGlite, which the tests use, parses text as JSON, so the tests never showed it.
// This setting: text goes in as-is (the database parses it as JSON), real objects are stringified once. Every postgres(...)
// connection in worker/ uses it. Checked on the live database: text → object/array, object → object.
export const JSONB = { types: { jsonb: { to: 3802, from: [3802], serialize: (x) => (typeof x === 'string' ? x : JSON.stringify(x)), parse: (x) => JSON.parse(x) } } };
