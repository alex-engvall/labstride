#!/usr/bin/env python3
"""Owned Linux verification only: lose one SSH reply, then kill its coordinator.

Run by the operator, outside the coding account. Never signals a shared daemon.
All executable/config paths and identities come from the protected probe spec.
"""
import json, os, pathlib, select, signal, sqlite3, subprocess, sys, time
def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def owned_process(pid, expected_uid, parent_pid, executable=None):
    require(isinstance(pid, int) and pid > 1, 'Invalid process ID')
    status = pathlib.Path(f'/proc/{pid}/status').read_text()
    require(all(int(uid) == expected_uid for uid in next(row for row in status.splitlines() if row.startswith('Uid:')).split()[1:]), 'Unexpected process identity')
    if executable:
        require(pathlib.Path(f'/proc/{pid}/exe').resolve() == pathlib.Path(executable).resolve(), 'Unexpected executable')
    ancestor = pid
    for _ in range(12):
        if ancestor == parent_pid or ancestor <= 1:
            break
        text = pathlib.Path(f'/proc/{ancestor}/status').read_text()
        ancestor = int(next(row for row in text.splitlines() if row.startswith('PPid:')).split()[1])
    require(ancestor == parent_pid, 'Process is outside the owned probe')

def signal_owned(pid, requested_signal, expected_uid, parent_pid, executable):
    descriptor = os.pidfd_open(pid)
    try:
        owned_process(pid, expected_uid, parent_pid, executable)
        signal.pidfd_send_signal(descriptor, requested_signal)
    finally:
        os.close(descriptor)

def main():
    spec_path, phase = sys.argv[1:]
    require(phase in ('execute', 'prepare', 'recover', 'status', 'enroll', 'before-human', 'after-human', 'cleanup-project'), 'Invalid phase')
    spec = json.loads(pathlib.Path(spec_path).read_text())
    require(spec['schemaVersion'] == '1.0', 'Invalid descriptor version')
    child = subprocess.Popen(['runuser', '-u', spec['coordinatorUser'], '--', spec['nodePath'], spec['probeScript'], spec_path, phase], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=sys.stderr, bufsize=0, start_new_session=True)
    buffer = b''
    watched = None
    paused = False
    reply_lost = False
    coordinator_killed = False
    started = time.monotonic()
    try:
        while True:
            readable, _, _ = select.select([sys.stdin.buffer, child.stdout], [], [], 0.005)
            for stream in readable:
                data = os.read(stream.fileno(), 65536)
                if stream is sys.stdin.buffer:
                    if data:
                        child.stdin.write(data)
                    continue
                if not data:
                    raise EOFError()
                sys.stdout.buffer.write(data)
                sys.stdout.buffer.flush()
                buffer += data
                while b'\n' in buffer:
                    line, buffer = buffer.split(b'\n', 1)
                    frame = json.loads(line)
                    if frame.get('kind') == 'ssh-client' and phase == 'execute':
                        require(watched is None, 'More than one SSH loss request')
                        pid = frame['pid']
                        owned_process(pid, spec['coordinatorUid'], child.pid, '/usr/bin/ssh')
                        watched = (pid, frame['operationId'])
                    if frame.get('kind') == 'kill-coordinator':
                        require(phase == 'execute' and reply_lost, 'Coordinator kill before qualified SSH loss')
                        pid = frame['pid']
                        signal_owned(pid, signal.SIGKILL, spec['coordinatorUid'], child.pid, spec['nodePath'])
                        coordinator_killed = True
                        print(json.dumps({'kind': 'fault-evidence', 'sshReplyLost': True, 'coordinatorKilled': True}), flush=True)
            if watched and not reply_lost:
                pid, operation_id = watched
                with sqlite3.connect('file:' + spec['targetRegistry'] + '?mode=ro', uri=True) as db:
                    row = db.execute('SELECT state FROM workspace_creations WHERE operation_id=?', (operation_id,)).fetchone()
                if row and row[0] == 'creating' and not paused:
                    # Receipt cannot reach the connector while its own SSH client is
                    # stopped. The separate remote helper keeps materializing.
                    signal_owned(pid, signal.SIGSTOP, spec['coordinatorUid'], child.pid, '/usr/bin/ssh')
                    paused = True
                if row and row[0] == 'ready':
                    require(paused, 'Missed the owned pre-receipt pause; no loss claim')
                    signal_owned(pid, signal.SIGKILL, spec['coordinatorUid'], child.pid, '/usr/bin/ssh')
                    reply_lost = True
                    print(json.dumps({'kind': 'fault-evidence', 'sshReplyLost': True, 'operationId': operation_id}), flush=True)
            if time.monotonic() - started > 180:
                raise TimeoutError('Owned verification timeout; retain uncertainty')
    except EOFError:
        code = child.wait()
        sys.exit(0 if phase == 'execute' and reply_lost and coordinator_killed and code != 0 else code)
    finally:
        if child.poll() is None:
            # Only this new verification child is stopped; never a shared service.
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
        if paused and not reply_lost and watched:
            try:
                signal_owned(watched[0], signal.SIGCONT, spec['coordinatorUid'], child.pid, '/usr/bin/ssh')
            except ProcessLookupError:
                pass

if __name__ == '__main__':
    main()
