"""Persistent stocking references and review memory in Aiven PostgreSQL."""
import re
import psycopg2

_verified = set()


class PostgresStockingConnection:
    postgres = True

    def __init__(self, url):
        self.connection = psycopg2.connect(url, connect_timeout=8, sslmode="require")
        self.cursors = []
        if url not in _verified:
            with self.connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_xact_lock(hashtext('smartpharm_stocking_schema'))")
                cursor.execute('''CREATE TABLE IF NOT EXISTS smartpharm_stocking_reference (
                    id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, composition TEXT,
                    manufacturer TEXT, pack TEXT, source TEXT, url TEXT)''')
                cursor.execute('''CREATE INDEX IF NOT EXISTS smartpharm_stocking_reference_fts
                    ON smartpharm_stocking_reference USING GIN (to_tsvector('simple', name))''')
                cursor.execute('''CREATE TABLE IF NOT EXISTS smartpharm_stocking_feedback (
                    id BIGSERIAL PRIMARY KEY, store_id BIGINT NOT NULL, user_id BIGINT,
                    medicine_id BIGINT NOT NULL, query_key TEXT, text_key TEXT,
                    details TEXT, created DOUBLE PRECISION NOT NULL)''')
                cursor.execute('''CREATE INDEX IF NOT EXISTS smartpharm_stocking_feedback_store
                    ON smartpharm_stocking_feedback(store_id, query_key, created)''')
                cursor.execute('''CREATE INDEX IF NOT EXISTS smartpharm_stocking_feedback_text
                    ON smartpharm_stocking_feedback(store_id, text_key, created)''')
            self.connection.commit()
            _verified.add(url)

    def execute(self, sql, parameters=()):
        sql = sql.replace('INSERT INTO reference VALUES',
                          'INSERT INTO reference(name,composition,manufacturer,pack,source,url) VALUES')
        sql = re.sub(r'\breference\b', 'smartpharm_stocking_reference', sql)
        sql = re.sub(r'\bfeedback\b', 'smartpharm_stocking_feedback', sql)
        sql = re.sub(r'\browid\b', 'id', sql).replace('?', '%s')
        cursor = self.connection.cursor()
        self.cursors.append(cursor)
        cursor.execute(sql, parameters)
        return cursor

    def __enter__(self):
        return self

    def __exit__(self, kind, value, traceback):
        if kind is None:
            self.connection.commit()
        else:
            self.connection.rollback()

    def close(self):
        for cursor in self.cursors:
            cursor.close()
        self.connection.close()
