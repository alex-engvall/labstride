#!/usr/bin/env python3
"""Validate documentation, not the planned application or live integrations."""
import copy
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:
    raise SystemExit('Install the documentation dependency: python3 -m pip install -r requirements-docs.txt')

from render_docs import ROOT, checklist


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))


def unique(rows, label):
    ids = [row['id'] for row in rows]
    require(len(ids) == len(set(ids)), f'Duplicate {label} ID')
    return set(ids)


def main():
    # Parse every JSON file, including files not otherwise referenced below.
    for path in ROOT.rglob('*.json'):
        json.loads(path.read_text(encoding='utf-8'))
    links = 0
    for path in ROOT.rglob('*.md'):
        for target in re.findall(r'\[[^\]]+\]\(([^)\s]+)\)', path.read_text(encoding='utf-8')):
            parsed = urlsplit(target)
            if parsed.scheme or target.startswith(('#', '//')):
                continue
            destination = (path.parent / unquote(parsed.path)).resolve()
            require(destination.is_relative_to(ROOT), f'Link escapes repository: {path}: {target}')
            require(destination.exists(), f'Missing linked file: {path}: {target}')
            links += 1

    pairs = {
        'config': 'installation.template', 'extension': 'extension',
        'operation': 'operation', 'receipt': 'receipt', 'event': 'event',
        'session-request': 'session-request', 'session-observation': 'session-observation',
    }
    validators, examples = {}, {}
    for name, example in pairs.items():
        shape = read(f'schemas/{name}.schema.json')
        Draft202012Validator.check_schema(shape)
        validator = Draft202012Validator(shape, format_checker=FormatChecker())
        value = read(f'examples/{example}.json')
        validator.validate(value)
        validators[name], examples[name] = validator, value
        malformed = copy.deepcopy(value)
        malformed['unexpectedCoreKey'] = True
        require(not validator.is_valid(malformed), f'{name} accepts unknown core keys')
        malformed = copy.deepcopy(value)
        del malformed['schemaVersion']
        require(not validator.is_valid(malformed), f'{name} accepts missing version')

    malformed = copy.deepcopy(examples['operation'])
    malformed['source']['sha'] = 'main'
    require(not validators['operation'].is_valid(malformed), 'Operation accepts branch instead of exact SHA')
    malformed = copy.deepcopy(examples['receipt'])
    malformed['conclusion'] = 'failed'
    require(not validators['receipt'].is_valid(malformed), 'Failed receipt accepts missing error')
    malformed = copy.deepcopy(examples['session-request'])
    malformed['command'] = 'resume'
    require(not validators['session-request'].is_valid(malformed), 'Resume accepts missing session')

    operation = copy.deepcopy(examples['operation'])
    digest = operation.pop('requestDigest')
    # Fixtures use ASCII keys/strings and integers only. This is not a general RFC 8785 implementation.
    canonical = json.dumps(operation, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    require(hashlib.sha256(canonical.encode()).hexdigest() == digest, 'Operation fixture digest mismatch')
    receipt = examples['receipt']
    for left, right in [('operationId', 'operationId'), ('targetId', 'targetId')]:
        require(receipt[left] == operation[right], f'Receipt fixture mismatch: {left}')
    require(receipt['sourceSha'] == operation['source']['sha'] and receipt['requestDigest'] == digest,
            'Receipt fixture source/digest mismatch')

    packages = read('docs/work-packages.json')
    package_ids = unique(packages, 'work package')
    graph = {p['id']: p['depends_on'] for p in packages}
    visited, visiting = set(), set()

    def visit(node):
        require(node in package_ids, f'Unknown package dependency {node}')
        require(node not in visiting, f'Work-package dependency cycle at {node}')
        if node in visited:
            return
        visiting.add(node)
        for dependency in graph[node]:
            visit(dependency)
        visiting.remove(node)
        visited.add(node)

    for node in graph:
        visit(node)
    requirements = read('docs/backlog.json')['requirements']
    requirement_ids = unique(requirements, 'requirement')
    cases = read('docs/acceptance-cases.json')['cases']
    unique(cases, 'acceptance case')
    covered = set()
    for case in cases:
        require(set(case['requirements']) <= requirement_ids, f'Unknown requirement in {case["id"]}')
        require(case['status'] in ('not_run', 'passed', 'failed', 'blocked'), f'Invalid case status: {case["id"]}')
        if case['status'] == 'passed':
            require(case['evidence'], f'Passed case lacks evidence: {case["id"]}')
        covered.update(case['requirements'])
    require(covered == requirement_ids, f'Requirements missing acceptance cases: {sorted(requirement_ids - covered)}')
    for r in requirements:
        require(r['work_package'] in package_ids, f'Unknown work package in {r["id"]}')
        require(r['depends_on_work_packages'] == graph[r['work_package']], f'Dependency drift in {r["id"]}')
        require((ROOT / 'docs' / r['spec']).is_file(), f'Missing specification for {r["id"]}')
        require(r['acceptance_criteria'], f'Missing acceptance criteria for {r["id"]}')
        require(r['status'] in ('planned', 'in_progress', 'implemented', 'verified'), f'Invalid requirement status {r["id"]}')
        if r['status'] == 'verified':
            require(r['verification_evidence'], f'Verified requirement lacks evidence: {r["id"]}')
    require((ROOT / 'docs/04-feature-checklist.md').read_text() == checklist(requirements),
            'Stale checklist: run python3 scripts/render_docs.py')
    print(f'PASS: {links} local file links; {len(pairs)} schema/example pairs and rejection cases; '
          f'{len(requirements)} requirements; {len(packages)} acyclic work packages; {len(cases)} acceptance specifications.')
    print('Application acceptance cases have not been executed by this documentation check.')


if __name__ == '__main__':
    main()
