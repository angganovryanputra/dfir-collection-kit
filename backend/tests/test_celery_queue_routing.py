import pytest
from kombu import Queue

from app.worker import celery_app


def test_celery_task_queues_defined():
    """Verify task_queues contains default, forensics, and periodic queues."""
    assert celery_app.conf.task_queues is not None
    queue_names = [q.name for q in celery_app.conf.task_queues]
    assert set(queue_names) == {"default", "forensics", "periodic"}
    assert len(queue_names) == 3


def test_celery_task_default_queue():
    """Verify task_default_queue is set to 'default'."""
    assert celery_app.conf.task_default_queue == "default"


@pytest.mark.parametrize(
    ("task_name", "expected_queue"),
    [
        ("dfir.run_pipeline", "forensics"),
        ("dfir.process_s3_upload", "forensics"),
        ("dfir.run_super_timeline", "forensics"),
        ("dfir.run_scheduled_collection", "forensics"),
        ("dfir.check_scheduled_collections", "periodic"),
        ("dfir.expire_legal_holds", "periodic"),
        ("dfir.verify_evidence_integrity", "periodic"),
    ],
)
def test_celery_task_routes_configuration(task_name: str, expected_queue: str):
    """Verify each task name explicitly routes to its designated queue in conf."""
    routes = celery_app.conf.task_routes
    assert isinstance(routes, dict)
    assert task_name in routes
    assert routes[task_name].get("queue") == expected_queue


@pytest.mark.parametrize(
    ("task_name", "expected_queue"),
    [
        ("dfir.run_pipeline", "forensics"),
        ("dfir.process_s3_upload", "forensics"),
        ("dfir.run_super_timeline", "forensics"),
        ("dfir.run_scheduled_collection", "forensics"),
        ("dfir.check_scheduled_collections", "periodic"),
        ("dfir.expire_legal_holds", "periodic"),
        ("dfir.verify_evidence_integrity", "periodic"),
    ],
)
def test_celery_router_resolution(task_name: str, expected_queue: str):
    """Verify Celery AMQP router resolves the task to the expected Queue object."""
    route_info = celery_app.amqp.router.route({}, task_name)
    assert "queue" in route_info
    resolved_queue = route_info["queue"]
    assert isinstance(resolved_queue, Queue)
    assert resolved_queue.name == expected_queue


def test_celery_unrouted_task_routes_to_default_queue():
    """Verify that an unrouted / arbitrary task routes to the default queue."""
    route_info = celery_app.amqp.router.route({}, "dfir.some_unrouted_task")
    assert "queue" in route_info
    resolved_queue = route_info["queue"]
    assert isinstance(resolved_queue, Queue)
    assert resolved_queue.name == "default"


def test_celery_task_time_limits_preserved():
    """Verify global and per-task hard/soft time limits are preserved."""
    # Global limits
    assert celery_app.conf.task_time_limit == 7200
    assert celery_app.conf.task_soft_time_limit == 6600

    # Task: dfir.run_pipeline (2h hard, 1h50m soft)
    run_pipeline = celery_app.tasks["dfir.run_pipeline"]
    assert run_pipeline.time_limit == 7200
    assert run_pipeline.soft_time_limit == 6600

    # Task: dfir.process_s3_upload (2h hard, 1h50m soft)
    process_s3 = celery_app.tasks["dfir.process_s3_upload"]
    assert process_s3.time_limit == 7200
    assert process_s3.soft_time_limit == 6600

    # Task: dfir.run_super_timeline (1h hard, 55m soft)
    super_timeline = celery_app.tasks["dfir.run_super_timeline"]
    assert super_timeline.time_limit == 3600
    assert super_timeline.soft_time_limit == 3300

    # Task: dfir.run_scheduled_collection (2h hard)
    scheduled_col = celery_app.tasks["dfir.run_scheduled_collection"]
    assert scheduled_col.time_limit == 7200


def test_celery_beat_schedule_tasks_routed_to_periodic():
    """Verify all periodic beat scheduled tasks are routed to the periodic queue."""
    beat_schedule = celery_app.conf.beat_schedule
    for schedule_name, schedule_info in beat_schedule.items():
        task_name = schedule_info["task"]
        route_info = celery_app.amqp.router.route({}, task_name)
        assert (
            route_info["queue"].name == "periodic"
        ), f"Beat schedule task {task_name} (schedule '{schedule_name}') should route to 'periodic' queue"
