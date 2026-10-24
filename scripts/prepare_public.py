#!/usr/bin/env python3
"""Render a disabled prepared-host installation. Never installs or starts services."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import subprocess


def main():
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--release', type=Path, help='Previously reviewed, protected release directory')
    source.add_argument('--bundle', type=Path, help='Bundle produced by package_local.py')
    parser.add_argument('--manifest-sha256')
    parser.add_argument('--configuration', type=Path, required=True)
    parser.add_argument('--service-user', required=True)
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z_][a-z0-9_-]{0,31}', args.service_user):
        raise ValueError('invalid_account')
    configuration = args.configuration.resolve(strict=True)
    manifest = None
    if args.bundle:
        bundle = args.bundle.resolve(strict=True)
        raw_manifest = (bundle / 'release-manifest.json').read_bytes()
        if not args.manifest_sha256 or hashlib.sha256(raw_manifest).hexdigest() != args.manifest_sha256:
            raise ValueError('manifest_mismatch')
        manifest = json.loads(raw_manifest)
        if manifest.get('schemaVersion') != '1.0' or not re.fullmatch(r'[a-f0-9]{40}', manifest.get('revision', '')) or manifest.get('nodeVersion') != '24.22.0':
            raise ValueError('manifest_invalid')
        release = bundle / 'files'
        seen = set()
        for entry in manifest['files']:
            name = entry['path']
            if name in seen or PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts or not re.fullmatch(r'[A-Za-z0-9_./@+ -]+', name):
                raise ValueError('manifest_invalid')
            seen.add(name)
            path = release / name
            if any(part.is_symlink() for part in [path, *path.parents]) or not path.is_file() or path.stat().st_nlink != 1 or path.stat().st_size != entry['size'] or entry['size'] > 160 * 1024 * 1024:
                raise ValueError('artifact_invalid')
            if hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
                raise ValueError('artifact_invalid')
        if not {'bin/node','apps/cli/main.ts','schemas/public-installation.schema.json','artifacts/provider-github-project.json'} <= seen:
            raise ValueError('incomplete_release')
    else:
        release = args.release.resolve(strict=True)
    destination = args.destination.absolute()
    # Keep systemd argument/expansion syntax out of generated directives.
    for path in [release, configuration, destination]:
        if not re.fullmatch(r'/[A-Za-z0-9_./-]+', str(path)):
            raise ValueError('unsupported_layout_path')
    spec = json.loads(configuration.read_text())
    if spec.get('schemaVersion') != '2.0' or spec.get('profile') != 'public' or spec.get('configuration', {}).get('enabled') is not False:
        raise ValueError('disabled_public_configuration_required')
    if not re.fullmatch(r'/[A-Za-z0-9_./-]+', spec.get('stateDirectory', '')):
        raise ValueError('unsupported_state_path')
    writable = {spec['stateDirectory']}
    for target in spec.get('configuration', {}).get('targets', {}).values():
        path = target.get('configuration', {}).get('enrollmentDirectory')
        if path is not None:
            if not isinstance(path, str) or not re.fullmatch(r'/[A-Za-z0-9_./-]+', path):
                raise ValueError('unsupported_enrollment_path')
            writable.add(path)
    node, cli = release / 'bin/node', release / 'apps/cli/main.ts'
    # Validate the complete schema locally; do not contact providers or resolve secrets.
    validator = "import {readFileSync} from 'node:fs';import {validated} from './packages/storage-sqlite/validation.ts';validated('public-installation',JSON.parse(readFileSync(process.argv[1],'utf8')));"
    subprocess.run([str(node), '--input-type=module', '-e', validator, str(configuration)], cwd=release, check=True, capture_output=True)
    os.umask(0o077)
    destination.mkdir(mode=0o700)  # Refuse existing/unmanaged output.
    if manifest:
        staged = destination / 'release'
        staged.mkdir(mode=0o700)
        for entry in manifest['files']:
            data = (release / entry['path']).read_bytes()
            if hashlib.sha256(data).hexdigest() != entry['sha256']:
                raise ValueError('artifact_changed')
            output = staged / entry['path']
            output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            output.write_bytes(data)
            output.chmod(0o755 if entry['executable'] else 0o644)
        (staged / 'release-manifest.json').write_bytes(raw_manifest)
        node, cli = staged / 'bin/node', staged / 'apps/cli/main.ts'
    command = shlex.quote(str(node)) + ' ' + shlex.quote(str(cli))
    launcher = '#!/bin/sh\ncase "$1" in\nversion) exec ' + command + ' "$@" ;;\n*) exec ' + command + ' --config ' + shlex.quote(str(configuration)) + ' "$@" ;;\nesac\n'
    (destination / 'labstride').write_text(launcher)
    (destination / 'labstride').chmod(0o755)
    unit = f'''[Unit]
Description=Labstride coordinator (operator activation required)
After=network-online.target
Wants=network-online.target
[Service]
User={args.service_user}
Group={args.service_user}
UMask=0077
ExecStart={node} {cli} serve --config {configuration}
Restart=on-failure
RestartSec=5
TimeoutStopSec=60
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths={' '.join(sorted(writable))}
'''
    # No Install section: rendering cannot enable a unit through enable --now.
    (destination / 'labstride.service').write_text(unit)
    print(json.dumps({'schemaVersion': '1.0', 'code': 'prepared_disabled', 'servicesChanged': False, 'reviewAccessFor': args.service_user}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        code = str(error) if re.fullmatch(r'[a-z_]{1,100}', str(error)) else 'preparation_failed'
        raise SystemExit(code)
