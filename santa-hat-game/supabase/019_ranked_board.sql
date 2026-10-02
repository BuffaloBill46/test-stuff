-- APPLIED live 2026-10-02 (through the Supabase connector).
-- 019: the Ranks page's Today / This week boards (2026-10-02): rank points GAINED in a window, from the ranked results the
-- referee server records (018). Public, like the All-time board (profiles are public to read: 001): names, wallets, level,
-- points and match counts only. The window starts at p_since (the page sends the player's own midnight, or 7 days ago),
-- never more than 8 days back (the board is for recent play; it can't be turned into a full history scan).

create function public.ranked_board(p_since timestamptz) returns table (name text, wallet text, level int, points int, matches int)
language sql stable security definer set search_path = '' as $$
  select p.name, p.wallet, p.level, sum(r.change)::int, count(*)::int
  from public.ranked_results r join public.profiles p on p.id = r.profile_id
  where r.at >= greatest(coalesce(p_since, now() - interval '1 day'), now() - interval '8 days')
  group by p.id, p.name, p.wallet, p.level
  order by 4 desc, 5 desc, p.name
  limit 50
$$;
revoke execute on function public.ranked_board(timestamptz) from public;
grant execute on function public.ranked_board(timestamptz) to anon, authenticated;
