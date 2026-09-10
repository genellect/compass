"""Offline contracts for the dependency auditor; no package or network mutation."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "dependency_audit", Path(__file__).resolve().parents[1] / "scripts/audit-python-dependencies.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class DependencyAuditTest(unittest.TestCase):
    def test_private_registry_is_never_sent(self):
        with self.assertRaises(ValueError):
            audit.locked_packages({"package": [{"name": "private", "version": "1",
                "source": {"registry": "https://registry.example.invalid/simple"}}]})

    def test_local_application_is_excluded_but_git_sources_require_review(self):
        public = {"name": "example", "version": "1", "source": {"registry": "https://pypi.org/simple"}}
        self.assertEqual(audit.locked_packages({"package": [public, {"source": {"virtual": "."}}]}),
                         [{"name": "example", "version": "1"}])
        with self.assertRaises(ValueError):
            audit.locked_packages({"package": [{"source": {"git": "https://example.invalid/repo"}}]})

    def test_osv_incomplete_error_and_pagination_cannot_pass(self):
        packages = [{"name": "example", "version": "1"}]
        for response in [{}, {"results": []}, {"results": [None]},
                         {"results": [{"error": "unavailable"}]},
                         {"results": [{"next_page_token": "more"}]},
                         {"results": [{"vulns": [{}]}]}]:
            with self.subTest(response=response), self.assertRaises(ValueError):
                audit.query_osv(packages, lambda payload: response)

    def test_osv_vulnerabilities_are_associated_with_correct_package(self):
        packages = [{"name": "first", "version": "1"}, {"name": "second", "version": "2"}]
        def request(payload):
            self.assertEqual(payload["queries"][1]["package"]["ecosystem"], "PyPI")
            return {"results": [{}, {"vulns": [{"id": "GHSA-example"}]}]}
        self.assertEqual(audit.query_osv(packages, request),
                         [{"name": "second", "version": "2", "advisories": ["GHSA-example"]}])

    def test_osv_batches_keep_full_coverage(self):
        packages = [{"name": f"example-{i}", "version": "1"} for i in range(205)]
        counts = []
        def request(payload):
            counts.append(len(payload["queries"]))
            return {"results": [{} for _ in payload["queries"]]}
        self.assertEqual(audit.query_osv(packages, request), [])
        self.assertEqual(counts, [100, 100, 5])


if __name__ == '__main__':
    unittest.main()
