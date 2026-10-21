"""Regression checks for the real documentation validator and schema registry."""
import copy
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

from referencing.exceptions import Unresolvable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from schema_validation import validators_for


def example(name):
    return json.loads((ROOT / 'examples' / f'{name}.json').read_text())


class SchemaValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.validators = validators_for(ROOT / 'schemas')

    def test_actual_timestamp_and_uri_formats(self):
        operation = example('operation')
        self.validators['operation'].validate(operation)
        for date in ['not-a-date', '2026-02-30T00:00:00Z', '2026-10-21T25:00:00Z', '2026-10-21T00:00:00']:
            with self.subTest(date=date):
                invalid = copy.deepcopy(operation)
                invalid['deadline'] = date
                self.assertFalse(self.validators['operation'].is_valid(invalid))
        config = example('installation.template')
        self.validators['config'].validate(config)
        for uri in ['not a uri', 'https://example.invalid/bad path', '/relative/path']:
            with self.subTest(uri=uri):
                invalid = copy.deepcopy(config)
                invalid['broker']['url'] = uri
                self.assertFalse(self.validators['config'].is_valid(invalid))

    def test_new_format_without_checker_fails_explicitly(self):
        with TemporaryDirectory(prefix='labstride-format-check-') as directory:
            schema = {'$schema': 'https://json-schema.org/draft/2020-12/schema',
                      'type': 'string', 'format': 'labstride-unsupported-format'}
            (Path(directory) / 'test.schema.json').write_text(json.dumps(schema))
            with self.assertRaisesRegex(ValueError, 'Missing format checkers: labstride-unsupported-format'):
                validators_for(directory)

    def test_registry_refuses_unregistered_file_and_http_references(self):
        with TemporaryDirectory(prefix='labstride-registry-check-') as directory:
            root = Path(directory)
            schemas = root / 'schemas'
            schemas.mkdir()
            outside = root / 'outside.schema.json'
            outside.write_text('{"type":"string"}')
            for ref in [outside.as_uri(), 'https://example.invalid/schema.json']:
                with self.subTest(ref=ref):
                    (schemas / 'test.schema.json').write_text(json.dumps({
                        '$schema': 'https://json-schema.org/draft/2020-12/schema', '$ref': ref}))
                    with self.assertRaises(Unresolvable):
                        validators_for(schemas)['test'].validate('synthetic')

    def test_uncertainty_cannot_be_reclassified_as_definite_failure(self):
        error = {'code': 'outcome_unknown', 'message': 'Synthetic lost reply',
                 'evidenceId': None, 'retryClass': 'reconcile'}
        for result in example('contract-families')['results']:
            with self.subTest(family=result['family']):
                uncertain = {**result, 'outcome': 'outcome_unknown', 'result': None, 'error': error}
                self.validators['contract-result'].validate(uncertain)
                uncertain['outcome'] = 'error'
                self.assertFalse(self.validators['contract-result'].is_valid(uncertain))
                if result['family'] in ('connector', 'action'):
                    direct = copy.deepcopy(result)
                    direct['result'].update(status='outcome_unknown', error=error)
                    self.validators['contract-result'].validate(direct)
                    for status in ['failed', 'cancelled', 'accepted', 'succeeded']:
                        direct['result']['status'] = status
                        self.assertFalse(self.validators['contract-result'].is_valid(direct))


if __name__ == '__main__':
    unittest.main()
