"""
История чатов XDai: получение списка разговоров и сообщений в разговоре.
"""
import json
import os
import psycopg2


SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def handler(event: dict, context) -> dict:
    """Возвращает список чатов или сообщения конкретного чата."""
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Session-Id",
        "Content-Type": "application/json"
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers, "body": ""}

    params = event.get("queryStringParameters") or {}
    session_id = params.get("session_id", "default")
    conversation_id = params.get("conversation_id", "")

    conn = get_conn()

    if conversation_id:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT id, role, content, image_url, created_at
                    FROM {SCHEMA}.messages
                    WHERE conversation_id = %s
                    ORDER BY created_at ASC""",
                (conversation_id,)
            )
            rows = cur.fetchall()
        messages = [
            {
                "id": str(r[0]),
                "role": r[1],
                "content": r[2],
                "image_url": r[3],
                "created_at": r[4].isoformat() if r[4] else None
            }
            for r in rows
        ]
        conn.close()
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({"messages": messages}, ensure_ascii=False)
        }
    else:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT id, title, created_at, updated_at
                    FROM {SCHEMA}.conversations
                    WHERE session_id = %s
                    ORDER BY updated_at DESC
                    LIMIT 50""",
                (session_id,)
            )
            rows = cur.fetchall()
        conversations = [
            {
                "id": str(r[0]),
                "title": r[1] or "Новый чат",
                "created_at": r[2].isoformat() if r[2] else None,
                "updated_at": r[3].isoformat() if r[3] else None
            }
            for r in rows
        ]
        conn.close()
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({"conversations": conversations}, ensure_ascii=False)
        }
