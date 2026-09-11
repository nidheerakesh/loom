-- A message can now carry a photo instead of, or alongside, text — the same "portfolio"
-- storage bucket pattern-upload-url.ts already uses, just under a "chat/" prefix. Nullable:
-- most messages stay text-only.
alter table messages add column attachment_path text;
