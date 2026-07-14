-- LinkedIn outreach is copy-paste only: the user pastes the person's profile
-- URL, Koda drafts the text, the user copies it and acts on LinkedIn
-- themselves. No scraping, no automation (LinkedIn ToS; see
-- docs/LINKEDIN_AUTOMATION.md for the full exploration).

alter table recruiting_moves
  add column if not exists person_linkedin_url text,
  add column if not exists connection_note text;
