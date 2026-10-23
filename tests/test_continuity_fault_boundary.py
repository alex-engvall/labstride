"""Actual Linux process checks, independent of any pilot or acceptance claim."""
import importlib.util
import os
from pathlib import Path
import signal
import subprocess
import sys
import unittest

MODULE = Path(__file__).resolve().parents[1] / 'tools/workspace-continuity/fault-runner.py'
spec = importlib.util.spec_from_file_location('continuity_fault_runner', MODULE)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


@unittest.skipUnless(sys.platform == 'linux' and hasattr(os, 'pidfd_open'), 'Linux pidfd support required')
class OwnedProcessBoundary(unittest.TestCase):
    def test_refuses_wrong_identity_executable_or_ancestry_before_signalling(self):
        child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])
        try:
            runner.owned_process(child.pid, os.getuid(), os.getpid(), sys.executable)
            for uid, parent, executable in [
                (os.getuid() + 1, os.getpid(), sys.executable),
                (os.getuid(), os.getpid(), '/bin/false'),
                (os.getuid(), child.pid + 1000000, sys.executable),
            ]:
                with self.assertRaises(RuntimeError):
                    runner.signal_owned(child.pid, signal.SIGKILL, uid, parent, executable)
                self.assertIsNone(child.poll())
            runner.signal_owned(child.pid, signal.SIGTERM, os.getuid(), os.getpid(), sys.executable)
            self.assertEqual(child.wait(timeout=5), -signal.SIGTERM)
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()

    def test_invalid_phase_is_rejected_with_python_optimization_enabled(self):
        result = subprocess.run([sys.executable, '-O', str(MODULE), '/absent-descriptor', 'unapproved'], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Invalid phase', result.stderr)
        self.assertNotIn('No such file', result.stderr)
