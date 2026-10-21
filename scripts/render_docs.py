#!/usr/bin/env python3
"""Render the readable checklist from the canonical requirements."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def checklist(reqs):
    out = ['# 04 — Feature checklist', '',
           'Generated from backlog.json. Edit the JSON and regenerate; do not maintain a second independent status list.', '']
    for r in reqs:
        out.extend(['## ' + r['id'] + ' — ' + r['title'], '',
                    '| Phase | Priority | Status | Work package |',
                    '| --- | --- | --- | --- |',
                    '| ' + r['phase'] + ' | ' + r['priority'] + ' | ' + r['status'] + ' | ' + r['work_package'] + ' |', '',
                    'Specification: [' + r['spec'] + '](' + r['spec'] + ').', '',
                    *['- ' + c for c in r['acceptance_criteria']], '',
                    'Verification evidence: ' + (', '.join(r['verification_evidence']) or 'None; not implemented.'), ''])
        if r.get('github_issue_url'):
            out.extend([f"Implementation issue: [#{r['github_issue']}]({r['github_issue_url']}).", ''])
    return '\n'.join(out).strip() + '\n'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    requirements = json.loads((ROOT / 'docs/backlog.json').read_text())['requirements']
    path = ROOT / 'docs/04-feature-checklist.md'
    expected = checklist(requirements)
    if args.check:
        if path.read_text() != expected:
            raise SystemExit('Stale checklist: run python3 scripts/render_docs.py')
        print('Generated checklist matches backlog.json')
    else:
        path.write_text(expected, encoding='utf-8')


if __name__ == '__main__':
    main()
