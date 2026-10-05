-- HOUSE BOTS (Cody, 2026-10-05: "add 15-20 bots on the Leaderboard, start at level 1, simulate 10 games against each other";
-- "use these bots for real player games too"; unlabeled on the board, with a line in the rules saying some players are house bots).
-- 18 accounts marked is_bot. They play real simulated matches (worker/housebots.mjs: 4-5 players each) and fill the bot places in
-- real matches (server/referee.js), so their levels, ranked points and stats are earned. They NEVER touch money: their "wallet" is a
-- random 32-byte address nobody holds a key for (profiles needs one), they buy nothing, and nothing is ever paid to them.
alter table public.profiles add column if not exists is_bot boolean not null default false;
create index if not exists profiles_is_bot on public.profiles (is_bot) where is_bot;
-- the match server reads the house bots (name, look, level) to put them in matches
create or replace function public.house_bots() returns table (id uuid, name text, avatar jsonb, level int, rank_points int)
language sql stable security definer set search_path = '' as $$ select p.id, p.name, p.avatar, p.level, p.rank_points from public.profiles p where p.is_bot order by p.name $$;
revoke execute on function public.house_bots() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'santa_referee') then grant execute on function public.house_bots() to santa_referee; end if;
  if exists (select 1 from pg_roles where rolname = 'santa_games') then grant execute on function public.house_bots() to santa_games; end if;
end $$;
-- the 18 accounts (fixed ids so this can be re-run safely)
insert into auth.users (id) values ('0beb8abd-ef3c-4978-9bc5-821a582bf481') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('0beb8abd-ef3c-4978-9bc5-821a582bf481', '2PYYAn6AczMv28xtmQ9V5ocKrD3PyRgAaAbQb56nQkDV', 'frostbyte', '{"shirt":"shirt_green","pants":"pants_snow","face":"face_snowman","skin":"skin_1","hat":"hat_beanie","pack":"pack_satchel","snow":"snow_pink"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('ea44b55f-67fa-49ea-aac8-eaf6019576f0') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('ea44b55f-67fa-49ea-aac8-eaf6019576f0', 'BRArtUXo8usFGkkiox7M5sK4Hvd9EzGH9XXNnVLXhZRh', 'Kaylee_x', '{"shirt":"shirt_red","pants":"pants_grey","face":"face_snowman","skin":"skin_3","hat":"hat_earmuffs","pack":"pack_sack","snow":"snow_ember"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('0084c300-210b-433a-ba7d-f54dd8824c5f') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('0084c300-210b-433a-ba7d-f54dd8824c5f', 'HmVuBddC6Nh7hgLhzSaSFYjCyoW9e3hiQNssxSYxh6Po', 'mikey2012', '{"shirt":"shirt_violet","pants":"pants_green","face":"face_gorilla","skin":"skin_1","hat":"hat_earmuffs","pack":"pack_satchel","snow":"snow_ember"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('731fb121-0778-4afd-9a7d-5715435e8ace') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('731fb121-0778-4afd-9a7d-5715435e8ace', 'FC5d49WreGNXRD3HJpioYUQtiUNCgvxdsncnt2mDsrVS', 'ghostpepper', '{"shirt":"shirt_red","pants":"pants_snow","face":"face_panda","skin":"skin_4","hat":"hat_beanie","pack":"pack_satchel","snow":"snow_white"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('8d6e0713-3871-454f-a052-4e2517f7a5b5') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('8d6e0713-3871-454f-a052-4e2517f7a5b5', 'BpJAg34ZAyh5LdwqwD8om739dMeCiPndwYqQRgctM5aZ', 'jollyroger7', '{"shirt":"shirt_gold","pants":"pants_red","face":"face_panda","skin":"skin_1","hat":"hat_tophat","pack":"pack_none","snow":"snow_ice"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('dc48a88e-36d9-42bf-9d70-ea2899d7a606') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('dc48a88e-36d9-42bf-9d70-ea2899d7a606', 'ERQjHfMfQp5UACqYrWvkVDarXuaaugdikgkqWsVsdCLV', 'TannerB', '{"shirt":"shirt_blue","pants":"pants_snow","face":"face_shades","skin":"skin_3","hat":"hat_none","pack":"pack_satchel","snow":"snow_green"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('474c59d3-4660-4ae2-b373-d4a7584aae92') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('474c59d3-4660-4ae2-b373-d4a7584aae92', '9PZvQZ78XAjHRU6Wpj6FkL8C3fDDP4v2nHLQkQX5t4P6', 'Ricky.D', '{"shirt":"shirt_snow","pants":"pants_snow","face":"face_shades","skin":"skin_2","hat":"hat_earmuffs","pack":"pack_none","snow":"snow_ember"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('e418ab93-e3c9-4722-8dfc-46f6d5d61247') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('e418ab93-e3c9-4722-8dfc-46f6d5d61247', 'GCA2nHmMJYwK4HVJdhNRvA5isLSzLfhUPbFLj5a83CBS', 'sn0wday', '{"shirt":"shirt_ember","pants":"pants_red","face":"face_snowman","skin":"skin_2","hat":"hat_beanie","pack":"pack_none","snow":"snow_green"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('a6b77b7e-201e-49ee-860e-470e817b6dcc') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('a6b77b7e-201e-49ee-860e-470e817b6dcc', '9bssSuvWnr7oHwqAPi3NYt2LDwqBUad2dwSeHrvgeck9', 'Brooke_22', '{"shirt":"shirt_ember","pants":"pants_brown","face":"face_snowman","skin":"skin_5","hat":"hat_beanie","pack":"pack_sack","snow":"snow_white"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('59e46b32-2d76-4378-ad39-e0e5c2c77f6f') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('59e46b32-2d76-4378-ad39-e0e5c2c77f6f', 'DagmQnYg4fKkp4jEHLpCqDbZagDpCjHwYf92JvMtc2ry', 'Icicle', '{"shirt":"shirt_teal","pants":"pants_snow","face":"face_wink","skin":"skin_2","hat":"hat_tophat","pack":"pack_gift","snow":"snow_pink"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('4aad858a-4beb-48b8-a449-31db27749417') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('4aad858a-4beb-48b8-a449-31db27749417', '6a2b6euT7L3xVX6jD29bDwgt4Ucq5r1M2dcte1jfsGhG', 'BigTay', '{"shirt":"shirt_coal","pants":"pants_green","face":"face_panda","skin":"skin_5","hat":"hat_tophat","pack":"pack_none","snow":"snow_green"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('8403111e-dd10-47f4-baf0-05744ecd7692') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('8403111e-dd10-47f4-baf0-05744ecd7692', '2dACrDEz2nN46fLCGQ76ytrsrB6wVLbz7yBVwvQTNCN6', 'zoe.plays', '{"shirt":"shirt_pink","pants":"pants_green","face":"face_dots","skin":"skin_3","hat":"hat_antlers","pack":"pack_none","snow":"snow_ember"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('02e52187-fee2-4517-907c-1922712a59fd') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('02e52187-fee2-4517-907c-1922712a59fd', 'ELEkJqYeNpbk5D7VpviHUHDBt38DDoYmofBdctdaEhQN', 'hat_hunter', '{"shirt":"shirt_pink","pants":"pants_navy","face":"face_mask","skin":"skin_1","hat":"hat_earmuffs","pack":"pack_none","snow":"snow_ice"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('9ecfc6fc-10b8-493b-9042-45fe6c0905ff') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('9ecfc6fc-10b8-493b-9042-45fe6c0905ff', '3nGQpphwj96aXC3kf1KPPvWjnquQX8KKmHtzhAjkSS81', 'tobiasz', '{"shirt":"shirt_pink","pants":"pants_green","face":"face_shades","skin":"skin_5","hat":"hat_antlers","pack":"pack_sack","snow":"snow_ember"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('b11d9b2f-d8b4-40db-902b-3e86c97c74fc') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('b11d9b2f-d8b4-40db-902b-3e86c97c74fc', 'HQxCPSHf1XZQBUFg5hzg4sjwthNJ3bzpoKoYrr6QR4ik', 'coco.bean', '{"shirt":"shirt_pink","pants":"pants_snow","face":"face_shades","skin":"skin_4","hat":"hat_earmuffs","pack":"pack_satchel","snow":"snow_ice"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('1b90a5fc-9693-4e9f-96a0-f478f698e1ec') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('1b90a5fc-9693-4e9f-96a0-f478f698e1ec', '6sbgtwtjGWpReUWCZzXCzivcfyv3QnGr5YbD7B3tVZPA', 'justjess', '{"shirt":"shirt_ember","pants":"pants_red","face":"face_panda","skin":"skin_1","hat":"hat_beanie","pack":"pack_none","snow":"snow_ice"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('572b73dd-a446-4a93-9f7d-812aa182a60e') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('572b73dd-a446-4a93-9f7d-812aa182a60e', 'A7CSue6UpzzKUWV6DJTMGTXRGB5y2iLEwg8cUk2g3b6N', 'DannyDoes', '{"shirt":"shirt_snow","pants":"pants_green","face":"face_mask","skin":"skin_2","hat":"hat_tophat","pack":"pack_satchel","snow":"snow_ember"}'::jsonb, true) on conflict (id) do nothing;
insert into auth.users (id) values ('0fcd136f-d399-4dec-b0d2-95b4715588a6') on conflict (id) do nothing;
insert into public.profiles (id, wallet, name, avatar, is_bot) values ('0fcd136f-d399-4dec-b0d2-95b4715588a6', '6AVxGFdfgszxXjP1m2ULeXiFrrUNMpN9s3FedEj7cUmk', 'yeti_mode', '{"shirt":"shirt_blue","pants":"pants_snow","face":"face_gorilla","skin":"skin_5","hat":"hat_tophat","pack":"pack_sack","snow":"snow_ember"}'::jsonb, true) on conflict (id) do nothing;
