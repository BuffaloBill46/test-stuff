-- 053: HOUSE BOTS' NEW NAMES (Cody 2026-10-05: "pick better names, be creative, those are too easy to pick out bot wise").
-- 050 gave the house bots names from the practice bots' list (mockups/refcore.js BOT_NAMES), so anyone who had played a practice
-- match had already seen them as bots. These names are on no bot list anywhere, and no player had them (checked live, any case).
-- tests/db/housebots-db.test.mjs: no house bot shares a name with a practice bot.
update public.profiles p set name = v.name from (values
  ('0084c300-210b-433a-ba7d-f54dd8824c5f'::uuid, 'Dorito_Dad'),
  ('02e52187-fee2-4517-907c-1922712a59fd'::uuid, 'vexxie_rae'),
  ('0beb8abd-ef3c-4978-9bc5-821a582bf481'::uuid, 'kaizen_ttv'),
  ('0fcd136f-d399-4dec-b0d2-95b4715588a6'::uuid, 'wrenzo'),
  ('1b90a5fc-9693-4e9f-96a0-f478f698e1ec'::uuid, 'lowkeyLuca'),
  ('474c59d3-4660-4ae2-b373-d4a7584aae92'::uuid, 'Cheesepuff44'),
  ('4aad858a-4beb-48b8-a449-31db27749417'::uuid, 'skrrtkid'),
  ('572b73dd-a446-4a93-9f7d-812aa182a60e'::uuid, 'averyy'),
  ('59e46b32-2d76-4378-ad39-e0e5c2c77f6f'::uuid, 'Ponchoo'),
  ('731fb121-0778-4afd-9a7d-5715435e8ace'::uuid, 'Juno_W'),
  ('8403111e-dd10-47f4-baf0-05744ecd7692'::uuid, 'sadboi_dj'),
  ('8d6e0713-3871-454f-a052-4e2517f7a5b5'::uuid, 'tacoNinja2'),
  ('9ecfc6fc-10b8-493b-9042-45fe6c0905ff'::uuid, 'MrsBrightside'),
  ('a6b77b7e-201e-49ee-860e-470e817b6dcc'::uuid, 'pablo.exe'),
  ('b11d9b2f-d8b4-40db-902b-3e86c97c74fc'::uuid, 'halfpint_hank'),
  ('dc48a88e-36d9-42bf-9d70-ea2899d7a606'::uuid, 'Zay2Fast'),
  ('e418ab93-e3c9-4722-8dfc-46f6d5d61247'::uuid, 'its_kenzie'),
  ('ea44b55f-67fa-49ea-aac8-eaf6019576f0'::uuid, 'nachoaverage')
) as v(id, name) where p.id = v.id and p.is_bot;
