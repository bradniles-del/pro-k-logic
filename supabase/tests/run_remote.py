#!/usr/bin/env python3
"""Rewrite a pgTAP test file so it can be run through a single-result-set SQL
runner (e.g. the Supabase MCP `execute_sql` tool, or the dashboard SQL editor).

Those runners only return the LAST statement's rows, so the per-test
"ok N - ..." lines from pgTAP are lost. This script:

  * creates a temp table `_r` right after `begin;` (granted to `authenticated`
    so it stays writable while the test impersonates a user),
  * rewrites every top-level `select plan(...)`, `is(...)`, `throws_ok(...)`,
    `lives_ok(...)`, `select tests.as_*(...)` and `select * from finish()` into
    `insert into _r(line) select ...`,
  * appends `select string_agg(line, E'\\n' order by n) from _r;` before the
    final `rollback;` so the whole TAP report comes back as one row.

Fixtures, DDL and the `begin;`/`rollback;` wrapper are passed through untouched,
so nothing persists in the database.

Usage:
    python3 supabase/tests/run_remote.py supabase/tests/001_isolation.sql > /tmp/runner.sql
    # then paste /tmp/runner.sql into execute_sql (or the SQL editor) and read the `tap` column.

Limitations: statements are split on ";\\n", so keep one statement per
terminating line and put comments on their own lines (a trailing `; -- note`
on a line prevents the next statement from being recognised). The test file
itself must still use `begin;` ... `rollback;` and a full-line `select plan(N);`.
"""
import re
import sys

ASSERT_RE = re.compile(r'select\s+(plan|is|isnt|ok|throws_ok|lives_ok|results_eq|is_empty)\(', re.I)


def transform(src: str) -> str:
    out = []
    for stmt in re.split(r';\n', src):
        s = '\n'.join(l for l in stmt.strip().splitlines() if not l.strip().startswith('--')).strip()
        if not s:
            continue
        if s.lower() == 'begin':
            out.append(s)
            out.append('create temp table _r(n serial, line text)')
            out.append('grant all on _r to authenticated')
            out.append('grant usage, select on sequence _r_n_seq to authenticated')
            continue
        if s.lower() == 'rollback':
            out.append("select string_agg(line, E'\\n' order by n) as tap from _r")
            out.append('rollback')
            continue
        if ASSERT_RE.match(s):
            s = 'insert into _r(line) ' + s
        elif s.lower().startswith('select * from finish()'):
            s = 'insert into _r(line) select * from finish()'
        elif s.lower().startswith('select tests.as_'):
            # helper calls return void; record a marker line so the switch is visible in the report
            s = "insert into _r(line) select coalesce(" + s[len('select '):] + "::text, '-- switched user')"
        out.append(s)
    return ';\n'.join(out) + ';\n'


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('usage: run_remote.py <pgtap-test.sql>  (writes rewritten SQL to stdout)')
    sys.stdout.write(transform(open(sys.argv[1]).read()))
