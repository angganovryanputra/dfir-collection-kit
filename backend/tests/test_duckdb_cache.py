"""
Unit tests for DuckDB read-only connection pooling and cache.

Validates:
- get_duckdb_read_conn returns a valid query cursor.
- Identical files share the same cached connection.
- Path vs string representation maps to the same cache entry.
- Distinct files maintain independent connections in cache.
- clear_duckdb_conn_cache clears a specific file or all cached connections.
- Re-connection handles closed or invalidated connections seamlessly.
- Thread-safe concurrent access.
- _query_duckdb_store utilizes the cached connection.
"""

from __future__ import annotations

import concurrent.futures
import os
import tempfile
from pathlib import Path

import duckdb
import pytest

from app.api.v1.endpoints.evidence import (
    _duckdb_conn_cache,
    _duckdb_conn_lock,
    _query_duckdb_store,
    clear_duckdb_conn_cache,
    get_duckdb_read_conn,
)


@pytest.fixture(autouse=True)
def clean_cache():
    """Ensure clean DuckDB connection cache before and after each test."""
    clear_duckdb_conn_cache()
    yield
    clear_duckdb_conn_cache()


@pytest.fixture
def temp_duckdb_factory():
    created_files: list[str] = []

    def _create(table_name: str = "t", rows: list[tuple] | None = None) -> Path:
        fd, tmp_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        os.remove(tmp_path)  # DuckDB needs to create the database file cleanly
        created_files.append(tmp_path)

        con = duckdb.connect(tmp_path)
        con.execute(f"CREATE TABLE {table_name} (id INTEGER, name VARCHAR)")
        if rows:
            con.executemany(f"INSERT INTO {table_name} VALUES (?, ?)", rows)
        else:
            con.execute(f"INSERT INTO {table_name} VALUES (1, 'initial')")
        con.close()
        return Path(tmp_path)

    yield _create

    for p in created_files:
        clear_duckdb_conn_cache(p)
        if os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass


def test_get_duckdb_read_conn_returns_valid_cursor(temp_duckdb_factory):
    db_path = temp_duckdb_factory("sample", [(10, "alpha"), (20, "beta")])
    cur = get_duckdb_read_conn(db_path)

    res = cur.execute("SELECT id, name FROM sample ORDER BY id").fetchall()
    assert res == [(10, "alpha"), (20, "beta")]
    cur.close()

    # Shared connection remains in cache
    with _duckdb_conn_lock:
        assert len(_duckdb_conn_cache) == 1


def test_duckdb_read_conn_caches_identical_file(temp_duckdb_factory):
    db_path = temp_duckdb_factory("data", [(1, "first")])

    cur1 = get_duckdb_read_conn(db_path)
    cur2 = get_duckdb_read_conn(str(db_path))

    with _duckdb_conn_lock:
        assert len(_duckdb_conn_cache) == 1

    res1 = cur1.execute("SELECT * FROM data").fetchall()
    res2 = cur2.execute("SELECT * FROM data").fetchall()
    assert res1 == [(1, "first")]
    assert res2 == [(1, "first")]

    cur1.close()
    cur2.close()

    # After cursor closing, cache is still populated
    with _duckdb_conn_lock:
        assert len(_duckdb_conn_cache) == 1


def test_duckdb_read_conn_handles_distinct_files(temp_duckdb_factory):
    db1 = temp_duckdb_factory("t1", [(1, "from_db1")])
    db2 = temp_duckdb_factory("t2", [(2, "from_db2")])

    cur1 = get_duckdb_read_conn(db1)
    cur2 = get_duckdb_read_conn(db2)

    with _duckdb_conn_lock:
        assert len(_duckdb_conn_cache) == 2

    assert cur1.execute("SELECT name FROM t1").fetchall() == [("from_db1",)]
    assert cur2.execute("SELECT name FROM t2").fetchall() == [("from_db2",)]

    cur1.close()
    cur2.close()


def test_clear_duckdb_conn_cache_specific_path(temp_duckdb_factory):
    db1 = temp_duckdb_factory("t1", [(1, "one")])
    db2 = temp_duckdb_factory("t2", [(2, "two")])

    get_duckdb_read_conn(db1)
    get_duckdb_read_conn(db2)

    with _duckdb_conn_lock:
        assert len(_duckdb_conn_cache) == 2

    clear_duckdb_conn_cache(db1)

    with _duckdb_conn_lock:
        assert len(_duckdb_conn_cache) == 1
        key2 = str(db2.resolve())
        assert key2 in _duckdb_conn_cache


def test_clear_duckdb_conn_cache_all(temp_duckdb_factory):
    db1 = temp_duckdb_factory("t1")
    db2 = temp_duckdb_factory("t2")

    get_duckdb_read_conn(db1)
    get_duckdb_read_conn(db2)

    with _duckdb_conn_lock:
        assert len(_duckdb_conn_cache) == 2

    clear_duckdb_conn_cache()

    with _duckdb_conn_lock:
        assert len(_duckdb_conn_cache) == 0


def test_reconnect_if_cached_connection_closed(temp_duckdb_factory):
    db_path = temp_duckdb_factory("reconnect", [(42, "meaning")])
    cur = get_duckdb_read_conn(db_path)
    cur.close()

    # Manually close cached connection to simulate connection dropped
    key = str(db_path.resolve())
    with _duckdb_conn_lock:
        cached_conn = _duckdb_conn_cache[key]
        cached_conn.close()

    # Next call should handle closed connection, reconnect, and return functional cursor
    new_cur = get_duckdb_read_conn(db_path)
    res = new_cur.execute("SELECT * FROM reconnect").fetchall()
    assert res == [(42, "meaning")]
    new_cur.close()


def test_thread_safe_concurrent_access(temp_duckdb_factory):
    db_path = temp_duckdb_factory("concurrent_test", [(i, f"val_{i}") for i in range(100)])

    def _query_worker(worker_id: int):
        cur = get_duckdb_read_conn(db_path)
        rows = cur.execute(
            f"SELECT name FROM concurrent_test WHERE id = {worker_id}"
        ).fetchall()
        cur.close()
        return rows

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_query_worker, i) for i in range(20)]
        results = [f.result() for f in futures]

    assert len(results) == 20
    for i, r in enumerate(results):
        assert r == [(f"val_{i}",)]

    with _duckdb_conn_lock:
        assert len(_duckdb_conn_cache) == 1


def test_query_duckdb_store_uses_cache(temp_duckdb_factory):
    db_path = temp_duckdb_factory(
        "timeline_events",
        [(1, "hostA"), (2, "hostB")]
    )
    # Adjust schema for timeline_events expected by _query_duckdb_store
    con = duckdb.connect(str(db_path))
    con.execute("DROP TABLE timeline_events")
    con.execute(
        "CREATE TABLE timeline_events (datetime TIMESTAMP, message VARCHAR, host VARCHAR)"
    )
    con.execute("INSERT INTO timeline_events VALUES (NOW(), 'msg1', 'hostA')")
    con.execute("INSERT INTO timeline_events VALUES (NOW(), 'msg2', 'hostB')")
    con.close()

    resp1 = _query_duckdb_store(db_path, q="", page=1, limit=10)
    assert resp1.total == 2
    assert len(resp1.data) == 2

    # Verify connection was cached
    with _duckdb_conn_lock:
        assert len(_duckdb_conn_cache) == 1

    resp2 = _query_duckdb_store(db_path, q="msg1", page=1, limit=10)
    assert resp2.total == 1
    assert resp2.data[0]["message"] == "msg1"

    with _duckdb_conn_lock:
        assert len(_duckdb_conn_cache) == 1
