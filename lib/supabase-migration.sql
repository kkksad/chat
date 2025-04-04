-- Create message_receipts table
CREATE TABLE IF NOT EXISTS message_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reader_id UUID NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, reader_id)
);

-- Create typing_status table
CREATE TABLE IF NOT EXISTS typing_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
  is_typing BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, recipient_id)
);

-- Add online and last_seen columns to chat_users if they don't exist
ALTER TABLE chat_users ADD COLUMN IF NOT EXISTS online BOOLEAN DEFAULT FALSE;
ALTER TABLE chat_users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create function to create typing_status table if it doesn't exist
CREATE OR REPLACE FUNCTION create_typing_status_table_if_not_exists()
RETURNS VOID AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS typing_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
    is_typing BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, recipient_id)
  );
END;
$$ LANGUAGE plpgsql;

