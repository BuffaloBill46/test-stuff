// SHOP rules (Cody's prices; DESIGN_NOTES → Economy). Pure: the page shows these and the server charges them, from this one file.
// Everything here is paid in SANTA in one transaction from the player's wallet: 50% burned, 50% to the treasury.
//   Store items: their price in the catalog (or as published from the admin screen: settings.js itemsWith).
//   Levels: $1 each to levels 2–4, $5 for level 5; higher levels are earned (levels.js buyPrice).
//   Extra ranked tickets: 1 for 10¢, 5 for 45¢, 10 for 90¢ (10% off the packs); at most 10 extra a day (006 buy_tickets).
export const SHOP_BURN_BPS = 5000;
export const TICKET_PACKS = { 1: 0.10, 5: 0.45, 10: 0.90 };
// Can this item be bought? A price, and not an empty slot. (Level-unlock items are earned, not sold.)
export const forSale = (it) => !!it && it.price != null && it.price > 0 && !/_none$/.test(it.id);
