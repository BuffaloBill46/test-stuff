-- 047: SUPPORT TICKETS THE PLAYER CAN FOLLOW (Cody, 2026-10-04: "put a ticket number on each one sent in, then add the ticket
-- number under the support button with pending or resolved, so they know and I don't have to reach out on all of them").
-- The ticket number is the message's id. A player who isn't signed in follows their tickets with a secret code their browser
-- keeps (only its one-way fingerprint is stored here, so nobody can look up someone else's ticket); a signed-in player sees
-- their own on any device. Cody's note when he marks one resolved is shown to the player (server/support.js status). Safe twice.
alter table public.support_messages add column if not exists ticket_key_hash text;
-- The player clears a RESOLVED ticket from their list with its × (Cody: "when it shows resolved put an x next to it so they can
-- remove it; that makes sure they see it; no x on pending"). Kept for Cody; just no longer shown to the player.
alter table public.support_messages add column if not exists player_cleared_at timestamptz;
