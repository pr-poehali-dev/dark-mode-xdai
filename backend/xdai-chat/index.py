"""
Основной чат с AI XDai: отправка сообщений, поддержка изображений, сохранение истории и памяти.
"""
import json
import os
import psycopg2
import urllib.request
import urllib.error
import base64
import uuid


SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")
API_KEY = os.environ.get("XDAI_API_KEY", "")
API_URL = "https://api.deepseek.com/v1/chat/completions"
MODEL = "deepseek-chat"


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def get_memory(session_id: str, conn) -> list:
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT content FROM {SCHEMA}.memory WHERE session_id = %s ORDER BY created_at DESC LIMIT 10",
            (session_id,)
        )
        rows = cur.fetchall()
    return [r[0] for r in rows]


def save_message(conversation_id: str, role: str, content: str, image_url: str, conn):
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO {SCHEMA}.messages (conversation_id, role, content, image_url) VALUES (%s, %s, %s, %s)",
            (conversation_id, role, content, image_url)
        )
    conn.commit()


def update_conversation_title(conversation_id: str, title: str, conn):
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE {SCHEMA}.conversations SET title = %s, updated_at = NOW() WHERE id = %s AND title IS NULL",
            (title, conversation_id)
        )
    conn.commit()


def get_or_create_conversation(conversation_id: str, session_id: str, conn) -> str:
    with conn.cursor() as cur:
        if conversation_id:
            cur.execute(f"SELECT id FROM {SCHEMA}.conversations WHERE id = %s", (conversation_id,))
            row = cur.fetchone()
            if row:
                return str(row[0])
        new_id = str(uuid.uuid4())
        cur.execute(
            f"INSERT INTO {SCHEMA}.conversations (id, session_id) VALUES (%s, %s)",
            (new_id, session_id)
        )
    conn.commit()
    return new_id


def get_conversation_messages(conversation_id: str, conn) -> list:
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT role, content, image_url FROM {SCHEMA}.messages WHERE conversation_id = %s ORDER BY created_at ASC LIMIT 50",
            (conversation_id,)
        )
        rows = cur.fetchall()
    return rows


def call_ai(messages: list) -> str:
    payload = json.dumps({
        "model": MODEL,
        "messages": messages,
        "max_tokens": 2048,
        "temperature": 0.7
    }).encode("utf-8")

    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}"
        },
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        result = json.loads(resp.read().decode("utf-8"))
    return result["choices"][0]["message"]["content"]


def handler(event: dict, context) -> dict:
    """Отправляет сообщение в AI и возвращает ответ, сохраняя историю."""
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Session-Id",
        "Content-Type": "application/json"
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers, "body": ""}

    body = json.loads(event.get("body") or "{}")
    session_id = body.get("session_id", "default")
    conversation_id = body.get("conversation_id", "")
    user_message = body.get("message", "").strip()
    image_base64 = body.get("image_base64", "")

    if not user_message and not image_base64:
        return {"statusCode": 400, "headers": cors_headers, "body": json.dumps({"error": "Сообщение пустое"})}

    conn = get_conn()

    conv_id = get_or_create_conversation(conversation_id, session_id, conn)

    memory_items = get_memory(session_id, conn)
    history_rows = get_conversation_messages(conv_id, conn)

    system_prompt = "Ты полезный AI-ассистент XDai. Отвечай на языке пользователя."
    if memory_items:
        memory_text = "\n".join(f"- {m}" for m in memory_items)
        system_prompt += f"\n\nПамять о пользователе:\n{memory_text}"

    messages = [{"role": "system", "content": system_prompt}]

    for row in history_rows:
        role, content, img_url = row
        messages.append({"role": role, "content": content})

    if image_base64:
        user_content = [
            {"type": "text", "text": user_message or "Что на этом изображении?"},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}
        ]
        messages.append({"role": "user", "content": user_content})
        save_message(conv_id, "user", user_message or "Что на этом изображении?", None, conn)
    else:
        messages.append({"role": "user", "content": user_message})
        save_message(conv_id, "user", user_message, None, conn)

    ai_reply = call_ai(messages)
    save_message(conv_id, "assistant", ai_reply, None, conn)

    if len(history_rows) == 0:
        title = user_message[:50] if user_message else "Новый чат"
        update_conversation_title(conv_id, title, conn)

    conn.close()

    return {
        "statusCode": 200,
        "headers": cors_headers,
        "body": json.dumps({
            "reply": ai_reply,
            "conversation_id": conv_id
        }, ensure_ascii=False)
    }
