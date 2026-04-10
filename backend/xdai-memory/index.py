"""
Управление памятью XDai: сохранение и получение пользовательской памяти.
"""
import json
import os
import psycopg2


SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "public")


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def handler(event: dict, context) -> dict:
    """Получает или сохраняет элементы памяти пользователя."""
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-User-Id, X-Session-Id",
        "Content-Type": "application/json"
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors_headers, "body": ""}

    method = event.get("httpMethod", "GET")

    if method == "GET":
        params = event.get("queryStringParameters") or {}
        session_id = params.get("session_id", "default")
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, content, created_at FROM {SCHEMA}.memory WHERE session_id = %s ORDER BY created_at DESC",
                (session_id,)
            )
            rows = cur.fetchall()
        conn.close()
        items = [{"id": str(r[0]), "content": r[1], "created_at": r[2].isoformat() if r[2] else None} for r in rows]
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({"memory": items}, ensure_ascii=False)
        }

    elif method == "POST":
        body = json.loads(event.get("body") or "{}")
        session_id = body.get("session_id", "default")
        content = body.get("content", "").strip()
        if not content:
            return {"statusCode": 400, "headers": cors_headers, "body": json.dumps({"error": "Содержимое пустое"})}
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                f"INSERT INTO {SCHEMA}.memory (session_id, content) VALUES (%s, %s) RETURNING id",
                (session_id, content)
            )
            new_id = cur.fetchone()[0]
        conn.commit()
        conn.close()
        return {
            "statusCode": 200,
            "headers": cors_headers,
            "body": json.dumps({"id": str(new_id), "content": content}, ensure_ascii=False)
        }

    return {"statusCode": 405, "headers": cors_headers, "body": json.dumps({"error": "Метод не разрешён"})}
