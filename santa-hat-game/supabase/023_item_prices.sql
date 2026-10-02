-- APPLIED live 2026-10-02 (checked after: prices equal the sheet; Heated Coat row gone).
-- Cody's price sheet (2026-10-02): new prices for special snowballs and special gear, and the Heated Coat removed from the
-- game. The shop charges from mockups/catalog.js (server/shop.js); these rows are the database's copy, kept equal (tests/db
-- gear-db + sball-db compare them). The Heated Coat row goes only if nothing refers to it (checked live first: no quotes,
-- owners, wear, purchases or saved looks); its gear kind stays in gear.js GEAR_KINDS (the matches' gear code), retired there.
update public.items i set price_usd = v.price from (values
  ('sb_ice', 1.00), ('sb_fire', 1.00), ('sb_giant', 2.00), ('sb_split', 2.00), ('sb_sky', 5.00), ('sb_rain', 10.00),
  ('gear_kevlar', 0.50), ('gear_pumpkin', 1.00), ('gear_santa', 2.00), ('gear_sack', 2.00), ('gear_backpack', 0.50),
  ('gear_satchel', 1.00), ('gear_shoes', 2.00), ('gear_elfhat', 0.50), ('gear_gift', 1.00)
) as v(id, price) where i.id = v.id;

delete from public.items i where i.id = 'gear_heated'
  and not exists (select 1 from public.inventory where item_id = i.id) and not exists (select 1 from public.shop_quotes where item_id = i.id)
  and not exists (select 1 from public.gear_wear where item_id = i.id) and not exists (select 1 from public.item_purchases where item_id = i.id);
