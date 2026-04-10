
CREATE TABLE IF NOT EXISTS t_p8191641_dark_mode_xdai.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    title TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p8191641_dark_mode_xdai.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES t_p8191641_dark_mode_xdai.conversations(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p8191641_dark_mode_xdai.memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON t_p8191641_dark_mode_xdai.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON t_p8191641_dark_mode_xdai.conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_memory_session_id ON t_p8191641_dark_mode_xdai.memory(session_id);
