#!/usr/bin/env python3
"""Build an inspectable local release. Never downloads or installs dependencies."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT).strip():
        raise SystemExit('Commit the reviewed source before packaging; preserved.')
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    node = Path(shutil.which('node')).resolve()
    if subprocess.check_output([str(node), '--version'], text=True).strip() != 'v24.22.0':
        raise SystemExit('The qualified Node 24.22.0 toolchain is required.')
    args.destination.mkdir(mode=0o700)
    files_root = args.destination / 'files'
    files_root.mkdir(mode=0o700)
    entries = []

    def copy(source, relative, executable=False):
        if source.is_symlink() or not source.is_file():
            raise SystemExit('Non-regular package input; preserved.')
        output = files_root / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        data = source.read_bytes()
        output.write_bytes(data)
        output.chmod(0o755 if executable else 0o644)
        entries.append({'path': relative, 'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data), 'executable': executable})

    paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).split(b'\0')
    for raw in paths:
        if raw:
            name = os.fsdecode(raw)
            copy(ROOT / name, name)
    for directory, folders, names in os.walk(ROOT / 'node_modules', followlinks=False):
        folders[:] = [name for name in folders if name != '.bin' and not (Path(directory) / name).is_symlink()]
        for name in names:
            source = Path(directory) / name
            if not source.is_symlink():
                copy(source, str(source.relative_to(ROOT)))
    copy(node, 'bin/node', executable=True)
    license_file = node.parent.parent / 'LICENSE'
    if not license_file.is_file():
        raise SystemExit('Node license missing; retain incomplete package for inspection.')
    copy(license_file, 'notices/Node-LICENSE')
    artifact_root = files_root / 'artifacts'
    artifact_root.mkdir()
    for package in ['connector-ssh', 'action-workspace-create', 'action-self-build', 'provider-github', 'action-github-workflow', 'action-github-merge', 'action-workspace-cleanup']:
        artifact = artifact_root / (package + '.json')
        subprocess.run([str(node), str(ROOT / 'scripts/package_extension.mjs'), str(ROOT / 'packages' / package), str(artifact)], check=True, stdout=subprocess.DEVNULL)
        data = artifact.read_bytes()
        entries.append({'path': str(artifact.relative_to(files_root)), 'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data), 'executable': False})
    manifest = {'schemaVersion': '1.0', 'revision': revision, 'nodeVersion': '24.22.0', 'files': sorted(entries, key=lambda e: e['path'])}
    encoded = (json.dumps(manifest, indent=2) + '\n').encode()
    (args.destination / 'release-manifest.json').write_bytes(encoded)
    print(json.dumps({'schemaVersion': '1.0', 'revision': revision, 'manifestSha256': hashlib.sha256(encoded).hexdigest(), 'files': len(entries)}))


if __name__ == '__main__':
    main()
