-- Explicit per-move Gmail send. gmail_sent_at is the idempotency claim and
-- the UI's "Sent via Gmail" evidence; gmail_message_id is Gmail's receipt.
-- Sending happens ONLY in /api/integrations/gmail/send on an explicit user
-- click, is fully deterministic (the saved draft is sent verbatim), and the
-- moves PATCH route still rejects any client-set 'sent' status: no client
-- may claim a message went out.

alter table recruiting_moves
  add column if not exists gmail_sent_at timestamptz,
  add column if not exists gmail_message_id text;
