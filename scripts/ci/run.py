"""Invoke the canonical four gates on the exact reviewed commit, never origin/main."""
import argparse
import gzip
import importlib.util
import pathlib
import subprocess
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
spec = importlib.util.spec_from_file_location("canonical_gates", HERE / "gates.py")
gates = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gates)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", action="append", default=[])
    args = ap.parse_args()
    repos = [str(ROOT), *args.provider]
    # Canonical deep-import checks need the producer exports. Never pass with an unknown producer.
    manifests = list(ROOT.glob("package.json")) + list(ROOT.glob("web/package.json"))
    import json
    declared = {}
    for mf in manifests:
        p = json.loads(mf.read_text())
        for section in gates.DEP_SECTIONS:
            declared.update({k: v for k, v in p.get(section, {}).items() if k.startswith("@hanamesh/")})
    providers = {json.loads((pathlib.Path(p) / "package.json").read_text())["name"] for p in args.provider}
    # Only cross-package subpath imports require a provider source checkout.
    own = json.loads((ROOT / "package.json").read_text()).get("name") if (ROOT / "package.json").exists() else None
    required = set()
    for path in gates.git(str(ROOT), "ls-tree", "-r", "--name-only", "HEAD").stdout.splitlines():
        if path.endswith(gates.SRC_EXT):
            for name, sub in gates.import_re("@hanamesh").findall(gates.show(str(ROOT), "HEAD", path) or ""):
                if sub and name != own and name in declared:
                    required.add(name)
    missing = required - providers
    # Snapshot only the installed public export manifests; do not guess missing providers.
    from contextlib import ExitStack
    stack = ExitStack()
    import atexit
    atexit.register(stack.close)
    for name in sorted(missing):
        manifest = ROOT / "node_modules" / name / "package.json"
        if not manifest.is_file():
            raise SystemExit("MISSING_GATE_PROVIDER " + name)
        data = json.loads(manifest.read_text())
        if data.get("name") != name:
            raise SystemExit("MISSING_GATE_PROVIDER " + name)
        directory = pathlib.Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="hm-gate-provider-")))
        (directory / "package.json").write_text(json.dumps(data))
        for command in [["git", "init", "-q"], ["git", "add", "package.json"], ["git", "-c", "user.name=CI", "-c", "user.email=ci@example.invalid", "commit", "-qm", "installed public exports"]]:
            subprocess.run(command, cwd=directory, check=True, capture_output=True)
        repos.append(str(directory))
    with tempfile.TemporaryDirectory(prefix="hm-ci-gates-") as scratch:
        policy = pathlib.Path(scratch) / "retired.txt"
        policy.write_bytes(gzip.decompress((HERE / "retired-names.txt.gz").read_bytes()))
        checks = {
            "retired": gates.gate_retired([str(ROOT)], "HEAD", None, str(policy)),
            "pins": gates.gate_pins([str(ROOT)], "HEAD", "origin/main", repos),
            "deep": gates.gate_deep(repos, "HEAD", "@hanamesh"),
            "cycles": gates.gate_cycles([str(ROOT)], "HEAD"),
        }
        # Canonical scanner targets src/. Chain keeps its business modules at the package root.
        if (ROOT / "index.js").exists() and not (ROOT / "src").exists():
            p = subprocess.run([str(HERE / "node_modules/.bin/depcruise"), "--config", str(HERE / "cycles.cjs"), "--output-type", "err", "index.js"], cwd=ROOT, capture_output=True, text=True)
            if p.returncode:
                checks["cycles"].append(p.stdout or p.stderr)
        for name, failures in checks.items():
            print(f"[{'FAIL' if failures else 'PASS'}] {name}: {len(failures)}")
            for failure in failures:
                print("  " + failure)
        if any(checks.values()):
            raise SystemExit(1)


if __name__ == "__main__":
    main()
