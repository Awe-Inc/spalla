CREATE TABLE file_blobs (
  storage_key text PRIMARY KEY,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
