"""Prove every copied gate rejects a real violation and passes after restoration."""
import pathlib
import tempfile
import unittest
import run

G = run.gates


class GatesBite(unittest.TestCase):
    def test_four_gates(self):
        with tempfile.TemporaryDirectory(prefix="hm-gates-bite-") as scratch:
            root = pathlib.Path(scratch)
            a, b = [root / ("hanamesh-" + n) for n in ["a", "b"]]
            def git(repo, *args):
                return G.git(str(repo), "-c", "user.name=CI fixture", "-c", "user.email=ci@example.invalid", *args)
            def commit(repo):
                git(repo, "add", "package.json", "src")
                git(repo, "commit", "--allow-empty", "-qm", "fixture")
            for repo in [a, b]:
                (repo / "src").mkdir(parents=True)
                git(repo, "init", "-q", "-b", "main")
                (repo / "package.json").write_text('{"name":"@hanamesh/' + repo.name[-1] + '","exports":{".":"./src/index.js"}}')
                (repo / "src/index.js").write_text("export const value = 1;\n")
                commit(repo)
            rs = list(map(str, [a, b]))
            policy = root / "retired.txt"
            policy.write_text("RetiredFixtureSymbol\tnegative case\n")
            def retire():
                return G.gate_retired(rs, "HEAD", None, str(policy))
            self.assertEqual(retire(), [])
            (b / "src/index.js").write_text("export const RetiredFixtureSymbol = 1;\n")
            commit(b)
            self.assertTrue(retire())
            (b / "src/index.js").write_text("export const value = 1;\n")
            commit(b)
            self.assertEqual(retire(), [])
            print("BITES retired")
            git(a, "tag", "v1.0.0")
            good = '{"name":"@hanamesh/b","dependencies":{"@hanamesh/a":"git+https://github.com/fixture/hanamesh-a.git#semver:^1.0.0"}}'
            (b / "package.json").write_text(good)
            commit(b)
            pins = lambda: G.gate_pins(rs, "HEAD", "main")
            self.assertEqual(pins(), [])
            (b / "package.json").write_text(good.replace("semver:^1.0.0", "main"))
            commit(b)
            self.assertTrue(pins())
            (b / "package.json").write_text(good)
            commit(b)
            self.assertEqual(pins(), [])
            print("BITES pins")
            deep = lambda: G.gate_deep(rs, "HEAD", "@hanamesh")
            (b / "src/index.js").write_text("import {value} from '@hanamesh/a';\n")
            commit(b)
            self.assertEqual(deep(), [])
            (b / "src/index.js").write_text("import {value} from '@hanamesh/a/src/index.js';\n")
            commit(b)
            self.assertTrue(deep())
            (b / "src/index.js").write_text("import {value} from '@hanamesh/a';\n")
            commit(b)
            self.assertEqual(deep(), [])
            print("BITES deep")
            cycles = lambda: G.gate_cycles(rs, "HEAD")
            (b / "src/x.js").write_text("export const x = 1;\n")
            (b / "src/y.js").write_text("import {x} from './x.js'; export const y = x;\n")
            commit(b)
            self.assertEqual(cycles(), [])
            (b / "src/x.js").write_text("import {y} from './y.js'; export const x = y + 1;\n")
            commit(b)
            self.assertTrue(cycles())
            (b / "src/x.js").write_text("export const x = 1;\n")
            commit(b)
            self.assertEqual(cycles(), [])
            print("BITES cycles")


if __name__ == "__main__":
    unittest.main()
