"""Audit public uv.lock package versions without executing the application.

Uses Python's standard library, OSV, and installed distribution metadata.
No credentials, source, environment variables, or production URLs are sent.
"""
import argparse
import importlib.metadata
import json
import re
import sys
import tomllib
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def normalize(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def locked_packages(lock):
    result = []
    for package in lock["package"]:
        registry = package.get("source", {}).get("registry")
        if registry is None:
            if package.get("source", {}).get("virtual") == ".":
                continue
            raise ValueError("Unreviewed non-registry package source")
        if registry != "https://pypi.org/simple":
            raise ValueError("Refusing to send non-public registry packages to OSV")
        result.append({"name": package["name"], "version": package["version"]})
    if not result:
        raise ValueError("Empty lockfile package inventory")
    return result


def query_osv(packages, request=None):
    def post(payload):
        req = urllib.request.Request(
            "https://api.osv.dev/v1/querybatch",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)

    request = request or post
    findings = []
    for offset in range(0, len(packages), 100):
        batch = packages[offset:offset + 100]
        payload = {"queries": [{"package": {"name": p["name"], "ecosystem": "PyPI"},
                                "version": p["version"]} for p in batch]}
        response = request(payload)
        results = response.get("results")
        if not isinstance(results, list) or len(results) != len(batch):
            raise ValueError("Incomplete OSV response; audit did not pass")
        for package, result in zip(batch, results):
            if not isinstance(result, dict) or result.get("error") or result.get("next_page_token"):
                raise ValueError("Invalid or paginated OSV response; audit did not pass")
            vulns = result.get("vulns", [])
            if not isinstance(vulns, list) or any(not isinstance(v, dict) or not v.get("id") for v in vulns):
                raise ValueError("Malformed vulnerability result; audit did not pass")
            if vulns:
                findings.append({**package, "advisories": sorted({v["id"] for v in vulns})})
    return findings


def installed_licenses(packages, policy):
    locked = {(normalize(p["name"]), p["version"]) for p in packages}
    rows = []
    reviewed = set(policy["reviewedExpressions"])
    for dist in importlib.metadata.distributions():
        name = normalize(dist.metadata["Name"])
        if (name, dist.version) not in locked:
            continue
        expression = dist.metadata.get("License-Expression") or dist.metadata.get("License") or ""
        if not expression:
            classifiers = dist.metadata.get_all("Classifier", [])
            if "License :: OSI Approved :: MIT License" in classifiers:
                expression = "MIT"
        expression = {"Apache 2.0": "Apache-2.0"}.get(expression, expression)
        # Legacy metadata is ambiguous: only version- and file-hash-specific reviews may resolve it.
        legacy = policy.get("pythonLegacyMetadata", {}).get(f"{name}@{dist.version}")
        if expression not in reviewed and legacy:
            import hashlib
            matches = [f for f in (dist.files or []) if str(f).replace("\\", "/").endswith(legacy["suffix"])]
            if len(matches) == 1 and hashlib.sha256(Path(dist.locate_file(matches[0])).read_bytes()).hexdigest() == legacy["sha256"]:
                expression = legacy["expression"]
        rows.append({"name": name, "version": dist.version, "license": expression or "UNKNOWN",
                     "reviewed": expression in reviewed})
    if not rows:
        raise ValueError("No locked distributions installed; run uv sync --locked --dev first")
    project = tomllib.loads((ROOT / "services/library-api/pyproject.toml").read_text())
    required = project["project"]["dependencies"] + project["dependency-groups"]["dev"]
    required_names = {normalize(re.match(r"[A-Za-z0-9_.-]+", item)[0]) for item in required}
    if not required_names <= {row["name"] for row in rows}:
        raise ValueError("Locked direct runtime/dev dependencies are missing from this environment")
    installed = {(row["name"], row["version"]) for row in rows}
    return {"scope": "Installed locked distributions on this platform; inspect other platforms separately",
            "packages": sorted(rows, key=lambda row: row["name"]),
            "notInstalled": [p for p in packages if (normalize(p["name"]), p["version"]) not in installed]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--licenses-only", action="store_true")
    args = parser.parse_args()
    lock = tomllib.loads((ROOT / "services/library-api/uv.lock").read_text())
    packages = locked_packages(lock)
    policy = json.loads((ROOT / "docs/legal/dependency-license-policy.json").read_text())
    licenses = installed_licenses(packages, policy)
    findings = None if args.licenses_only else query_osv(packages)
    output = ROOT / "test-results/security/python-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"lockedPackages": len(packages), "vulnerabilities": findings,
                                  "licenses": licenses}, indent=2) + "\n")
    unreviewed = [p for p in licenses["packages"] if not p["reviewed"]]
    for item in unreviewed:
        print(f"Unreviewed license: {item['name']}@{item['version']}")
    for item in findings or []:
        print(f"Vulnerable: {item['name']}@{item['version']}: {', '.join(item['advisories'])}")
    print(f"Python licenses: {len(licenses['packages'])} installed; {len(unreviewed)} unreviewed")
    print("OSV: not run (licenses only)" if findings is None else
          f"OSV: {len(packages)} locked packages; {len(findings)} affected packages")
    return 1 if unreviewed or findings else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        # Do not print response bodies, package contents or machine-specific paths.
        print(f"Python audit failed ({type(exc).__name__}); no passing result.", file=sys.stderr)
        sys.exit(2)
