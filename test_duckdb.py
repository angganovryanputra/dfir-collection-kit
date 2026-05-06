import duckdb
import json

# create a dummy jsonl
with open("test.jsonl", "w") as f:
    f.write(json.dumps({"datetime": "2023-01-01T00:00:00Z", "message": "hello", "source": "test", "extra1": "foo"}) + "\n")
    f.write(json.dumps({"datetime": "2023-01-01T00:01:00Z", "message": "world", "source": "test", "extra2": "bar"}) + "\n")

con = duckdb.connect()
con.execute("CREATE SEQUENCE row_id_seq")
con.execute("""
    CREATE TABLE timeline_events (
        row_id BIGINT,
        host VARCHAR,
        message VARCHAR,
        extra JSON
    )
""")

con.execute("""
    INSERT INTO timeline_events
    SELECT 
        nextval('row_id_seq'),
        'myhost',
        message,
        to_json(j)
    FROM read_json_auto('test.jsonl') as j
""")

print(con.execute("SELECT * FROM timeline_events").fetchall())
