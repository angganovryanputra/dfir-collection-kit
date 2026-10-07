import pytest
from app.services.attack_chain_service import _build_graph, _extract_attack_tags, TECHNIQUE_TACTIC_MAP


def test_extract_attack_tags():
    tags = ["attack.lateral_movement", "attack.t1021.001", "other.tag"]
    tactics, techniques = _extract_attack_tags(tags)
    assert tactics == ["lateral_movement"]
    assert techniques == ["T1021.001"]


def test_build_graph_maps_technique_to_matching_tactic():
    tactics = ["initial_access", "lateral_movement"]
    techniques = ["T1021.001"]  # Remote Desktop - lateral movement
    # Co-occurring tags associate T1021.001 with lateral_movement
    technique_to_tactics = {"T1021.001": {"lateral_movement"}}

    nodes, edges = _build_graph(tactics, techniques, technique_to_tactics)
    uses_edges = [e for e in edges if e["label"] == "uses"]
    assert len(uses_edges) == 1
    assert uses_edges[0]["source"] == "lateral_movement"
    assert uses_edges[0]["target"] == "T1021.001"


def test_build_graph_uses_fallback_taxonomy_map():
    tactics = ["execution", "command_and_control"]
    techniques = ["T1059.001"]  # PowerShell - execution

    nodes, edges = _build_graph(tactics, techniques, {})
    uses_edges = [e for e in edges if e["label"] == "uses"]
    assert len(uses_edges) == 1
    assert uses_edges[0]["source"] == "execution"
    assert uses_edges[0]["target"] == "T1059.001"
