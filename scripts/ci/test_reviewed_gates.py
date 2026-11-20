"""Targeted canonical-gate regressions; uses committed, isolated fixture repositories only."""
import concurrent.futures
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location("canonical_gates", Path(__file__).with_name("gates.py"))
g = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(g)


class GatesRegression(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="gt1-test-", dir=os.environ.get("GATES_TEST_PARENT")))
        self.state("active")
        self.addCleanup(self.finish)
        self.a = self.repo("hanamesh-a", {"name": "@hanamesh/a"})
        self.write(self.a, "src/a.js", "export const a = 1\n")
        self.commit(self.a)
        g.git(str(self.a), "tag", "v0.1.0")
        self.sha = g.git(str(self.a), "rev-parse", "HEAD").stdout.strip()
        self.spec = "git+https://github.com/fixture/hanamesh-a.git#semver:^0.1.0"
        self.b = self.repo("hanamesh-b", {"name": "@hanamesh/b"})

    def state(self, value):
        (self.root / ".run-state.json").write_text(json.dumps({"state": value, "by": os.environ.get("GATES_RUN_BY", "GT1"), "why": "定向机器门回归证据", "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}))

    def finish(self):
        if os.environ.get("GATES_TEST_PARENT"):
            self.state("keep")
        else:
            import shutil
            shutil.rmtree(self.root)

    def repo(self, name, manifest):
        p = self.root / name
        p.mkdir()
        g.git(str(p), "init", "-q", "-b", "main")
        self.write(p, "package.json", json.dumps(manifest))
        self.commit(p)
        return p

    def write(self, repo, path, text):
        p = repo / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)

    def commit(self, repo):
        g.git(str(repo), "add", "-A")
        g.git(str(repo), "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture", "--allow-empty")

    def lock(self, importer=".", sha=None, section="dependencies"):
        return ("lockfileVersion: '9.0'\nimporters:\n  " + importer + ":\n    " + section + ":\n      '@hanamesh/a':\n        specifier: " + self.spec + "\n        version: https://codeload.github.com/fixture/hanamesh-a/tar.gz/" + (sha or self.sha) + "\n")

    def dep(self, path="package.json", section="dependencies"):
        self.write(self.b, path, json.dumps({"name": "@hanamesh/b", section: {"@hanamesh/a": self.spec}}))

    def pins(self, lookup=None):
        self.commit(self.b)
        return g.gate_pins([str(self.b)], "HEAD", "main", lookup or [str(self.a), str(self.b)])

    def test_independent_child_and_missing_record(self):
        self.dep("packages/sub/package.json")
        self.write(self.b, "pnpm-lock.yaml", self.lock(sha="1" * 40))
        self.write(self.b, "packages/sub/pnpm-lock.yaml", self.lock())
        self.assertEqual([], self.pins())
        self.write(self.b, "packages/sub/pnpm-lock.yaml", "lockfileVersion: '9.0'\nimporters:\n  .: {}\n")
        self.assertTrue(any("没有这条依赖" in x for x in self.pins()))
        self.write(self.b, "packages/sub/pnpm-lock.yaml", self.lock())
        self.assertEqual([], self.pins())

    def test_workspace_ownership_and_no_sibling_borrow(self):
        self.dep("packages/sub/package.json")
        self.write(self.b, "pnpm-lock.yaml", self.lock())
        self.assertTrue(any("importers 不含 packages/sub" in x for x in self.pins()))
        self.write(self.b, "pnpm-lock.yaml", self.lock("packages/sub"))
        self.assertEqual([], self.pins())
        self.write(self.b, "pnpm-lock.yaml", self.lock("packages/other") + "  packages/sub:\n    dependencies: {}\n")
        self.assertTrue(any("没有这条依赖" in x for x in self.pins()))
        self.write(self.b, "pnpm-lock.yaml", self.lock("packages/sub", section="devDependencies"))
        self.assertTrue(any("没有这条依赖" in x for x in self.pins()))

    def test_missing_lock_fails(self):
        self.dep()
        self.assertTrue(any("找不到所属锁" in x for x in self.pins()))
        self.write(self.b, "pnpm-lock.yaml", self.lock())
        self.assertEqual([], self.pins())

    def test_install_locks_only_and_ssh_root_child_still_fail(self):
        self.dep("packages/sub/package.json")
        self.write(self.b, "pnpm-workspace.yaml", "packages:\n  - '**'\n")
        self.write(self.b, "pnpm-lock.yaml", self.lock())
        self.write(self.b, "packages/sub/pnpm-lock.yaml", self.lock())
        ssh = "resolution: {repo: git@github.com:fixture/hanamesh-a.git, type: git}\n"
        frozen = {}
        for directory in ("docs/acceptance/consumer-before", "test/fixtures/host-extraction"):
            self.write(self.b, directory + "/package.json", "{invalid frozen fixture\n")
            path = directory + "/pnpm-lock.yaml"
            self.write(self.b, path, ssh)
            frozen[path] = (self.b / path).read_bytes()
        self.assertEqual([], self.pins())
        self.assertEqual(["package.json", "packages/sub/package.json"], g._manifests(str(self.b), "HEAD"))
        for path in ("pnpm-lock.yaml", "packages/sub/pnpm-lock.yaml"):
            original = (self.b / path).read_text()
            self.write(self.b, path, original + ssh)
            hits = self.pins()
            self.assertTrue(any("hanamesh-b/" + path + " 锁文件出现" in hit for hit in hits), hits)
            self.write(self.b, path, original)
            self.assertEqual([], self.pins())
        self.assertTrue(all((self.b / path).read_bytes() == data for path, data in frozen.items()))

    def test_reverse_consumers_respect_scope_and_skip(self):
        self.dep()
        self.write(self.b, "pnpm-lock.yaml", self.lock())
        self.commit(self.b)
        c = self.repo("hanamesh-c", {"name": "@hanamesh/c", "dependencies": {"@hanamesh/b": "^1.0.0"}})
        statuses = {"hanamesh-a": "在范围", "hanamesh-b": "在范围", "hanamesh-c": "在范围"}
        for suffix, status in (("frozen", "冻结"), ("retired", "退休"), ("pending", "待确认"), ("app-vibe-trading", "不在范围"), ("unknown", None)):
            name = "hanamesh-" + suffix
            repo = self.repo(name, {"name": "@hanamesh/" + suffix, "dependencies": {"@hanamesh/a": "^0.1.0"}})
            self.write(repo, "pnpm-lock.yaml", "git@github.com:fixture/hanamesh-a.git\n")
            self.commit(repo)
            if status is not None:
                statuses[name] = status
        docs = self.root / "docs"
        table = docs / "tools/repo-scope.txt"
        self.write(docs, "tools/repo-scope.txt", "# canonical scope\n" + "".join(name + "\t" + status + "\tfixture\n" for name, status in statuses.items()))
        args = ["python3", str(Path(g.HERE, "gates.py")), "--root", str(self.root), "--docs", str(docs), "--repos", "hanamesh-a", "--ref", "HEAD", "--main-ref", "main", "--only", "pins", "--no-fetch", "--json", "-"]
        for extra, expected in (([], {"hanamesh-b", "hanamesh-c"}), (["--skip", ""], {"hanamesh-b", "hanamesh-c"}), (["--docs", "", "--repo-scope", str(table), "--skip", "hanamesh-b"], set())):
            r = subprocess.run(args + extra, capture_output=True, text=True)
            self.assertEqual(0, r.returncode, r.stdout + r.stderr)
            data = json.loads(r.stdout)
            self.assertEqual(expected, set(data["pinConsumers"]))
            self.assertEqual(str(table), data["pinScope"]["path"])
            self.assertEqual(statuses, data["pinScope"]["statuses"])
            (self.root / ("scope-skip-receipt.json" if not expected else "scope-receipt.json")).write_text(r.stdout)
        # Without a scope table, the owner's default vibe exclusion still applies.
        refs = g._pin_consumers([str(self.a)], [str(self.a), str(self.root / "hanamesh-app-vibe-trading")], "HEAD", "main", skip={"hanamesh-app-vibe-trading"})
        self.assertEqual({str(self.a): "HEAD"}, refs)
        table.write_text("hanamesh-a\t未知状态\tfixture\n")
        r = subprocess.run(args, capture_output=True, text=True)
        self.assertEqual(2, r.returncode, r.stdout + r.stderr)
        self.assertIn("repo-scope 格式错误", r.stderr)
        table.unlink()
        r = subprocess.run(args + ["--repo-scope", str(table)], capture_output=True, text=True)
        self.assertEqual(2, r.returncode, r.stdout + r.stderr)

    def test_nearest_unowned_lock_blocks_ancestor(self):
        self.dep("packages/group/packages/sub/package.json")
        self.write(self.b, "pnpm-lock.yaml", self.lock("packages/group/packages/sub"))
        self.write(self.b, "packages/group/pnpm-lock.yaml", self.lock())
        self.assertTrue(any("最近 packages/group/pnpm-lock.yaml" in x for x in self.pins()))

    def test_missing_local_upstream_fetches_main_and_all_tags(self):
        self.dep()
        self.write(self.b, "pnpm-lock.yaml", self.lock())
        # Real git ls-remote + fetch; URL rewrite keeps the test local and deterministic.
        env = {"GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": "url." + self.a.as_uri() + ".insteadOf", "GIT_CONFIG_VALUE_0": "https://github.com/fixture/hanamesh-a.git"}
        with mock.patch.dict(os.environ, env):
            self.assertEqual([], self.pins([str(self.b)]))
            g.git(str(self.a), "checkout", "-qb", "side")
            self.write(self.a, "side.txt", "side\n")
            self.commit(self.a)
            g.git(str(self.a), "tag", "v0.1.1")
            g.git(str(self.a), "checkout", "-q", "main")
            self.assertTrue(any("v0.1.1 不在" in x for x in self.pins([str(self.b)])))
            g.git(str(self.a), "tag", "-d", "v0.1.1")
            self.assertEqual([], self.pins([str(self.b)]))

    def test_reverse_consumers_json_and_explicit_cycles_scope(self):
        self.dep()
        self.write(self.b, "pnpm-lock.yaml", self.lock())
        self.commit(self.b)
        c = self.repo("hanamesh-c", {"name": "@hanamesh/c", "dependencies": {"@hanamesh/b": "^1.0.0"}})
        other = self.repo("hanamesh-unrelated", {"name": "@hanamesh/unrelated"})
        args = ["python3", str(Path(g.HERE, "gates.py")), "--root", str(self.root), "--docs", "", "--repos", "hanamesh-a", "--ref", "HEAD", "--main-ref", "main", "--only", "pins,cycles", "--no-fetch", "--cache-dir", str(self.root / "cache"), "--json", "-"]
        r = subprocess.run(args, capture_output=True, text=True)
        self.assertEqual(0, r.returncode, r.stdout + r.stderr)
        data = json.loads(r.stdout)
        self.assertEqual(["hanamesh-a"], data["selectedRepos"])
        self.assertEqual({"hanamesh-b", "hanamesh-c"}, set(data["pinConsumers"]))
        self.assertEqual(["hanamesh-a"], [r["repo"] for r in data["results"] if r["gate"] == "cycles"])
        self.assertTrue(all(r["seconds"] >= 0 and r["commit"] and r["tree"] for r in data["results"]))
        (self.root / "scope-receipt.json").write_text(r.stdout)
        bad = subprocess.run(args + ["--repos", "missing"], capture_output=True, text=True)
        self.assertEqual(2, bad.returncode)

    def test_cycles_full_graph_cache_and_invalidation(self):
        self.write(self.b, "src/a.js", "import {b} from '../packages/sub/src/b.js'; export const a = b\n")
        self.write(self.b, "packages/sub/src/b.js", "export const b = 1\n")
        self.commit(self.b)
        cache = str(self.root / "cache")
        with mock.patch.object(g, "gate_cycles", wraps=g.gate_cycles) as cruise:
            items, hit, key = g._cycles_cached(str(self.b), "HEAD", cache)
            self.assertEqual(([], False), (items, hit))
            self.assertTrue(g._cycles_cached(str(self.b), "HEAD", cache)[1])
            self.assertEqual(1, cruise.call_count)
            self.write(self.b, "packages/sub/src/b.js", "import {a} from '../../../src/a.js'; export const b = a\n")
            self.commit(self.b)
            items, hit, changed = g._cycles_cached(str(self.b), "HEAD", cache)
            self.assertTrue(items)
            self.assertFalse(hit)
            self.assertNotEqual(key, changed)
            self.assertEqual(2, cruise.call_count)
            self.assertTrue(g._cycles_cached(str(self.b), "HEAD", cache)[0])
            self.assertEqual(2, cruise.call_count)
            self.write(self.b, "packages/sub/src/b.js", "export const b = 1\n")
            self.commit(self.b)
            self.assertEqual(([], True, key), g._cycles_cached(str(self.b), "HEAD", cache))

    def test_cycles_without_src_directory(self):
        self.write(self.b, "index.js", "import {b} from './lib/b.js'; export const a = b\n")
        self.write(self.b, "lib/b.js", "export const b = 1\n")
        self.commit(self.b)
        self.assertEqual([], g.gate_cycles([str(self.b)], "HEAD"))
        self.write(self.b, "lib/b.js", "import {a} from '../index.js'; export const b = a\n")
        self.commit(self.b)
        self.assertTrue(g.gate_cycles([str(self.b)], "HEAD"))
        self.write(self.b, "lib/b.js", "export const b = 1\n")
        self.commit(self.b)
        self.assertEqual([], g.gate_cycles([str(self.b)], "HEAD"))

    def test_size_atomic_concurrent_snapshots_warn_only(self):
        self.write(self.b, "src/b.js", "export const b = 1\n" * 4)
        self.commit(self.b)
        history = self.root / "history.json"
        original = json.dumps([{"t": time.time() - 8 * 86400, "counts": {"hanamesh-b": 1}}])
        history.write_text(original)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: g.gate_size([str(self.b)], "HEAD", str(history)), range(2)))
        self.assertTrue(all(results))
        self.assertEqual(original, history.read_text())
        snapshots = list(Path(str(history) + ".snapshots").glob("*.json"))
        self.assertEqual(2, len(snapshots))
        self.assertTrue(all(json.loads(p.read_text())["counts"] == {"hanamesh-b": 4} for p in snapshots))
        args = ["python3", str(Path(g.HERE, "gates.py")), "--root", str(self.root), "--docs", "", "--repos", "hanamesh-b", "--ref", "HEAD", "--only", "size", "--no-fetch", "--state", str(history), "--json", "-"]
        r = subprocess.run(args, capture_output=True, text=True)
        self.assertEqual(0, r.returncode, r.stderr)
        self.assertEqual("WARN", json.loads(r.stdout)["results"][0]["status"])


if __name__ == "__main__":
    unittest.main()
