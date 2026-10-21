"""Local-only schema registry with mandatory format enforcement."""
import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource


def formats_in(value):
    if isinstance(value, dict):
        if 'format' in value:
            yield value['format']
        for child in value.values():
            yield from formats_in(child)
    elif isinstance(value, list):
        for child in value:
            yield from formats_in(child)


def validators_for(schema_dir):
    schema_dir = Path(schema_dir).resolve()
    schemas = {p: json.loads(p.read_text()) for p in sorted(schema_dir.glob('*.schema.json'))}
    checker = FormatChecker()
    needed = {name for schema in schemas.values() for name in formats_in(schema)}
    missing = needed - checker.checkers.keys()
    if missing:
        raise ValueError('Missing format checkers: ' + ', '.join(sorted(missing)) +
                         '; install requirements-docs.txt in the selected Python environment')
    for schema in schemas.values():
        Draft202012Validator.check_schema(schema)
    registry = Registry().with_resources(
        (path.as_uri(), Resource.from_contents(schema)) for path, schema in schemas.items())
    # No network retrieval or arbitrary filesystem resolver is installed.
    return {path.name.removesuffix('.schema.json'): Draft202012Validator(
        {'$ref': path.as_uri()}, registry=registry, format_checker=checker) for path in schemas}
