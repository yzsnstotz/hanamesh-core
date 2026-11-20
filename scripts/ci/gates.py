#!/usr/bin/env python3
"""HanaMesh 机器门（《编排工作法》§3.5 第 2 层）。只读：读各仓 <ref> 上的内容，不动工作树。

门：
  retired  退休名单里的名字不许出现（R12）
  pins     git 依赖只许 #semver: 标签范围（提交/分支/标签/其它写法 FAIL）；满足范围的标签须在上游 main 上；锁文件不许 SSH 形、解析提交须是满足范围的 main 标签；含子包（owner 10-31 追加定案）
  deep     不许 import 别的 @hanamesh 包未导出的子路径（§3 第 9 条）
  cycles   仓内无循环依赖（dependency-cruiser）
  size     非测试代码行数周增长 >30% 报警（R8，只报警不失败）
  docs     合约页仍写「候选」的列出来（§3 第 11 条，只报警不失败）
  homegrown  <ref> 相对 <main-ref> 新增的自造通用机制特征（工作法 §3 第 8 条；AUD1 §C.6，只报警不失败，交审查员按审查模板「自造轮子」判断）

退出码：任一失败门 → 1。
"""
import argparse, fnmatch, json, os, re, subprocess, sys, tarfile, tempfile, time, io
import hashlib
from pathlib import Path
from contextlib import ExitStack

HERE = os.path.dirname(os.path.abspath(__file__))


def git(repo, *args, check=True):
    r = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} @ {repo}: {r.stderr.strip()}")
    return r


def repos(root, prefix, skip):
    out = []
    for name in sorted(os.listdir(root)):
        p = os.path.join(root, name)
        if name.startswith(prefix) and name not in skip and os.path.exists(os.path.join(p, ".git")):
            out.append(p)
    return out


def show(repo, ref, path):
    r = git(repo, "show", f"{ref}:{path}", check=False)
    return r.stdout if r.returncode == 0 else None


def gate_retired(rs, ref, docs, retired, docs_ref="origin/main"):
    names = []
    for line in open(retired, encoding="utf-8"):
        if line.strip() and not line.startswith("#"):
            pat, _, why = line.rstrip("\n").partition("\t")
            names.append((pat, why))
    targets = [(r, ref, []) for r in rs] + ([(docs, docs_ref, ["contracts"])] if docs else [])  # docs 永远看 main，产品仓分支名在 docs 里不存在
    hits = []
    for repo, rf, paths in targets:
        for pat, why in names:
            r = git(repo, "grep", "-n", "-I", "-P", pat, rf, "--", *(paths or ["."]), check=False)
            if r.returncode == 1:
                continue
            if r.returncode != 0:
                raise RuntimeError(f"git grep failed @ {repo}: {r.stderr.strip()}")
            lines = r.stdout.splitlines()
            hits.append(f"{os.path.basename(repo)}: /{pat}/ {len(lines)} 处（{why}），例 {lines[0][:160]}")
    return hits


GIT_DEP = re.compile(r"^git\+https://github\.com/[^/]+/([^/#]+?)\.git#semver:([^&]+)(?:&path:/[^&]+)?$")
# 任何 git 来源的写法：git+协议、git@、git://、托管简写（github:/gitlab:/bitbucket:）、owner/repo 简写、托管站 .git URL
GITISH = re.compile(r"^(?:git\+[a-z]+:|git:|git@|ssh://|(?:github|gitlab|bitbucket|gist):|[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:#.*)?$|https?://[^#]*\.git(?:#.*)?$)")
DEP_SECTIONS = ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies")
SEMVER = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$")


def _ver(text):
    m = SEMVER.match(text.strip())
    if not m:
        return None
    pre = tuple(int(p) if p.isdigit() else p for p in m.group(4).split(".")) if m.group(4) else ()
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))), pre


def _lt(a, b):
    """node-semver 排序：核心号先比；有预发布 < 无预发布；预发布逐段比（数字 < 字母）。"""
    if a[0] != b[0]:
        return a[0] < b[0]
    if not a[1] or not b[1]:
        return bool(a[1]) and not b[1]
    for x, y in zip(a[1], b[1]):
        if x == y:
            continue
        if isinstance(x, int) != isinstance(y, int):
            return isinstance(x, int)
        return x < y
    return len(a[1]) < len(b[1])


def satisfies(version, rng):
    """只支持本项目写法：`^x.y.z[-pre]` 或精确 `x.y.z[-pre]`，可用 `||` 连接；其它写法返回 None（无法核对）。"""
    v = _ver(version)
    if not v:
        return False
    hit = False
    for part in rng.split("||"):
        part = part.strip()
        caret = part.startswith("^")
        lo = _ver(part[1:] if caret else part)
        if not lo:
            return None
        if not caret:
            hit |= v == lo
            continue
        (M, m, p) = lo[0]
        hi = ((M + 1, 0, 0) if M else (0, m + 1, 0) if m else (0, 0, p + 1), ())
        # node-semver：预发布版本只在核心号与范围下限相同（且下限本身带预发布）时才可能命中
        if v[1] and not (lo[1] and v[0] == lo[0]):
            continue
        hit |= not _lt(v, lo) and _lt(v, hi)
    return hit


def _git_deps(pj):
    out = []
    for sec in DEP_SECTIONS:
        out += [(sec, k, v) for k, v in (pj.get(sec) or {}).items() if isinstance(v, str)]
    for sec, table in (("pnpm.overrides", (pj.get("pnpm") or {}).get("overrides")), ("overrides", pj.get("overrides"))):
        out += [(sec, k, v) for k, v in (table or {}).items() if isinstance(v, str)]
    return out


def _manifests(repo, ref):
    """仓根 package.json + 子包：pnpm-workspace.yaml 的 packages 范围，以及 packages/ 下的包（如 shared 的 packages/devkit）。"""
    files = git(repo, "ls-tree", "-r", "--name-only", ref, check=False).stdout.split()
    globs = ["packages/*/package.json", "packages/*/*/package.json"]
    ws = show(repo, ref, "pnpm-workspace.yaml") or ""
    m = re.search(r"^packages:\s*\n((?:[ \t]*(?:-.*|#.*)?\n)+)", ws + "\n", re.M)
    if m:
        for line in m.group(1).splitlines():
            g = line.strip()
            if g.startswith("-"):
                g = g[1:].strip().strip("'\"").rstrip("/")
                if g and not g.startswith("!") and g != ".":
                    globs.append(g + "/package.json")
    picked = ["package.json"] if "package.json" in files else []
    picked += sorted(f for f in files if f != "package.json" and "node_modules/" not in f
                     and not f.startswith(("docs/", "test/fixtures/"))
                     and any(fnmatch.fnmatchcase(f, g) for g in globs))
    return picked


def _importers(lock):
    """Read pnpm's generated two-space importer map, preserving each importer boundary."""
    out, key = {}, None
    inside = False
    for line in lock.splitlines():
        if line == "importers:":
            inside = True
            continue
        if not inside:
            continue
        if line and not line[0].isspace() and not line.startswith("#"):
            break
        m = re.fullmatch(r"  (\S.*):\s*", line)
        if m:
            key = m[1].strip("\"'")
            out[key] = []
        elif key is not None:
            out[key].append(line)
    return {key: "\n".join(lines) for key, lines in out.items()}


def _owning_lock(repo, ref, manifest):
    directory = os.path.dirname(manifest)
    current = directory
    while True:
        path = (current + "/" if current else "") + "pnpm-lock.yaml"
        lock = show(repo, ref, path)
        if lock is not None:
            importer = os.path.relpath(directory or ".", current or ".").replace(os.sep, "/")
            # The nearest lock is a boundary: never borrow a more distant lock on mismatch.
            if importer != "." and importer not in _importers(lock):
                return path, None, importer
            return path, lock, importer
        if not current:
            return None, None, None
        current = os.path.dirname(current)


def _locked_commits(lock, dep, spec, importer=".", section=None):
    """Resolve only this manifest's importer and dependency section, never a sibling's."""
    block = _importers(lock).get(importer, "")
    if section in DEP_SECTIONS:
        match = re.search(r"^    " + re.escape(section) + r":\n((?: {6}.*\n?|\s*\n)*)", block + "\n", re.M)
        block = match[1] if match else ""
    pat = re.compile(r"^      ['\"]?" + re.escape(dep) + r"['\"]?:\n        specifier: ['\"]?" + re.escape(spec) + r"['\"]?\n        version: ['\"]?(\S+?)['\"]?$", re.M)
    sha = re.compile(r"(?:#|codeload\.github\.com/[^/]+/[^/]+/tar\.gz/)([0-9a-f]{40})")
    return [m.group(1) if (m := sha.search(v)) else None for v in pat.findall(block)]


def _remote_upstream(stack, url):
    # ls-remote alone cannot prove ancestry. Fetch main + all tags into an isolated bare repo.
    r = subprocess.run(["git", "ls-remote", "--exit-code", url, "refs/heads/main"], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError("无法从上游读取 main（git ls-remote exit %d）" % r.returncode)
    target = stack.enter_context(tempfile.TemporaryDirectory(prefix="gates-upstream-"))
    git(target, "init", "--bare", "-q")
    r = git(target, "fetch", "-q", url, "+refs/heads/main:refs/remotes/origin/main", "+refs/tags/*:refs/tags/*", check=False)
    if r.returncode:
        raise RuntimeError("无法取回上游 main/tags（git fetch exit %d）" % r.returncode)
    return target


def gate_pins(rs, ref, main_ref, lookup=None):
    with ExitStack() as stack:
        return _gate_pins(rs, ref, main_ref, lookup, stack)


def _gate_pins(rs, ref, main_ref, lookup, stack):
    """依赖写 git 标签范围（owner 10-31 追加定案：依赖必须是 npm 版本或 #semver: 标签范围）：
    1) @hanamesh 依赖或指向 yzsnstotz 的依赖，凡是 git 来源，只许 `git+https://github.com/<owner>/<仓>.git#semver:<范围>[&path:/…]`；
       `#<提交>`、分支名、标签名、无 ref、git+ssh / git@ / github: 简写等其它写法一律 FAIL；
    2) `#semver:<范围>` 必须在上游找到满足的 v* 标签，且满足范围的每个标签都在上游 main 上（pnpm 只挑最高的满足标签，不看分支）；
    3) pnpm-lock.yaml 里出现 `git@github.com:` FAIL；锁文件里该依赖解析到的提交必须是某个满足范围、在 main 上的标签所指提交；
    4) 仓根和子包（pnpm 工作区、packages/ 下的包）的 package.json 都查。
    标签来自 `git fetch --tags origin`（main() 里），已删分支上的标签也看得到。"""
    by_name = {os.path.basename(r): r for r in (lookup or rs)}  # 上游按全部本地仓查，不受 --prefix 限制
    tags_cache = {}
    bad = []
    remote_targets = {}

    def tags_on(dep_repo, target):
        if dep_repo not in tags_cache:
            out = {}
            for t in git(target, "tag", "-l", "v*").stdout.split():
                c = git(target, "rev-parse", f"refs/tags/{t}^{{commit}}", check=False).stdout.strip()
                out[t] = c
            tags_cache[dep_repo] = out
        return tags_cache[dep_repo]

    for repo in rs:
        name = os.path.basename(repo)
        manifests = _manifests(repo, ref)
        # Installation inputs only: root lock and the nearest lock of each production
        # manifest. Historical docs and test fixtures must remain frozen evidence.
        owners = {mf: _owning_lock(repo, ref, mf) for mf in manifests}
        locks = {owner[0] for owner in owners.values() if owner[0] is not None}
        if show(repo, ref, "pnpm-lock.yaml") is not None:
            locks.add("pnpm-lock.yaml")
        for path in sorted(locks):
            lock = show(repo, ref, path) or ""
            if "git@github.com:" in lock:
                bad.append(f"{name}/{path} 锁文件出现 {lock.count('git@github.com:')} 处 git@github.com:（SSH 形），须禁用 SSH 重生成为 HTTPS 形")
        for mf in manifests:
            raw = show(repo, ref, mf)
            if not raw:
                continue
            try:
                pj = json.loads(raw)
            except ValueError as e:
                bad.append(f"{name}/{mf} 无法解析：{e}")
                continue
            here = name if mf == "package.json" else f"{name}/{mf[:-len('/package.json')]}"
            lock_path, lock, importer = owners[mf]
            for sec, dep, spec in _git_deps(pj):
                ours = dep.startswith("@hanamesh/") or "yzsnstotz" in spec
                if not ours or not GITISH.match(spec):
                    continue
                where = f"{here} {sec}.{dep} = {spec[:110]}"
                m = GIT_DEP.match(spec)
                if not m:
                    frag = spec.split("#", 1)[1].split("&", 1)[0] if "#" in spec else ""
                    kind = "#<提交>" if re.fullmatch(r"[0-9a-f]{7,40}", frag) else ("没有 ref" if not frag else "#<分支/标签/其它 ref>")
                    if not spec.startswith("git+https://github.com/"):
                        kind += "，且不是 git+https://github.com/ 写法"
                    bad.append(f"{where}：{kind}；git 依赖只许 git+https://…/<仓>.git#semver:<范围>")
                    continue
                dep_repo, rng = m.groups()
                target = by_name.get(dep_repo)
                upstream_ref = main_ref
                if not target:
                    url = spec.split("#", 1)[0].removeprefix("git+")
                    try:
                        if url not in remote_targets:
                            remote_targets[url] = _remote_upstream(stack, url)
                        target = remote_targets[url]
                        upstream_ref = "refs/remotes/origin/main"
                    except RuntimeError as e:
                        bad.append(f"{where}：{e}")
                        continue
                hits, unsupported = [], False
                for t, c in tags_on(target, target).items():
                    ok = satisfies(t, rng)
                    if ok is None:
                        unsupported = True
                        break
                    if ok:
                        hits.append((t, c))
                if unsupported:
                    bad.append(f"{where}：范围写法不支持，无法核对")
                    continue
                if not hits:
                    bad.append(f"{where}：上游没有满足范围的 v* 标签")
                    continue
                good = set()
                for t, c in hits:
                    r = git(target, "merge-base", "--is-ancestor", c, upstream_ref, check=False)
                    if r.returncode != 0:
                        bad.append(f"{where}：满足范围的标签 {t} 不在 {dep_repo} 的 {main_ref} 上")
                    else:
                        good.add(c)
                if lock is None:
                    bad.append(f"{where}：找不到所属锁文件" + (f"（最近 {lock_path} 的 importers 不含 {importer}）" if lock_path else ""))
                    continue
                if sec == "peerDependencies":
                    continue
                locked = _locked_commits(lock, dep, spec, importer, sec)
                if not locked:
                    bad.append(f"{where}：锁文件里没有这条依赖的解析记录")
                for c in locked:
                    if c not in good:
                        bad.append(f"{where}：锁文件解析到 {str(c)[:8]}，不是任何满足范围且在 main 上的标签所指提交")
    return bad


def import_re(scope):
    return re.compile(r"""(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"](""" + re.escape(scope) + r"""/[a-z0-9._-]+)(/[^'"]+)?['"]""")
SRC_EXT = (".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx")


def export_keys(pj):
    exp = pj.get("exports")
    if exp is None:
        return None  # 没有 exports 字段：不限制
    if isinstance(exp, str) or not any(k.startswith(".") for k in exp):
        return ["."]
    return list(exp.keys())


def allowed(sub, keys):
    if keys is None:
        return True
    want = "." + sub
    for k in keys:
        if k == want or ("*" in k and fnmatch.fnmatchcase(want, k)):
            return True
    return False


def gate_deep(rs, ref, scope, lookup=None, main_ref="origin/main"):
    IMPORT = import_re(scope)
    pkgs = {}
    for repo in (lookup or rs):
        pj = show(repo, ref, "package.json") or show(repo, main_ref, "package.json")
        if pj:
            d = json.loads(pj)
            if d.get("name"):
                pkgs[d["name"]] = export_keys(d)
    bad = []
    for repo in rs:
        own = json.loads(show(repo, ref, "package.json") or "{}").get("name")
        files = git(repo, "ls-tree", "-r", "--name-only", ref).stdout.splitlines()
        for f in files:
            if not f.endswith(SRC_EXT) or "/node_modules/" in f or f.startswith("node_modules/"):
                continue
            text = show(repo, ref, f) or ""
            for m in IMPORT.finditer(text):
                name, sub = m.group(1), m.group(2)
                head = text[text.rfind("\n", 0, m.start()) + 1:m.start()]
                if head.count('"') % 2 or head.count("`") % 2:
                    continue  # 写在字符串里的样例（如负面测试、变异目标），不是真 import
                if sub and name != own and name in pkgs and not allowed(sub, pkgs[name]):
                    line = text.count("\n", 0, m.start()) + 1
                    bad.append(f"{os.path.basename(repo)} {f}:{line} import {name}{sub}（{name} 未导出该子路径）")
    return bad


def gate_cycles(rs, ref):
    bin_ = os.path.join(HERE, "node_modules", ".bin", "depcruise")
    bad = []
    for repo in rs:
        dirs = [d for d in git(repo, "ls-tree", "-d", "-r", "--name-only", ref).stdout.splitlines()
                if os.path.basename(d) == "src" and not any(p in d.split("/") for p in ("node_modules", "dist", "vendor"))]
        # Include source files outside src too (for example root index.js and lib/).
        files = git(repo, "ls-tree", "-r", "--name-only", ref).stdout.splitlines()
        extra = [f for f in files if f.endswith(SRC_EXT)
                 and not any(part in f.split("/") for part in ("node_modules", "dist", "vendor", "coverage", ".next"))
                 and not any(f.startswith(d + "/") for d in dirs)]
        entries = dirs + extra
        if not entries:
            continue
        # One invocation sees every package and follows imports across source roots.
        with tempfile.TemporaryDirectory(prefix="gates-") as tmp:
            data = subprocess.run(["git", "-C", repo, "archive", ref], capture_output=True, check=True).stdout
            with tarfile.open(fileobj=io.BytesIO(data)) as archive:
                archive.extractall(tmp)
            r = subprocess.run([bin_, "--config", os.path.join(HERE, "cycles.cjs"),
                                "--output-type", "err", *entries], cwd=tmp, capture_output=True, text=True,
                               env={**os.environ, "NODE_PATH": os.path.join(HERE, "node_modules")})
            if r.returncode != 0:
                msg = " | ".join(l.strip() for l in r.stdout.splitlines() if "no-circular" in l)[:400]
                bad.append(f"{os.path.basename(repo)}: 循环依赖 {msg or r.stdout.strip()[:400] or r.stderr.strip()[:400]}")
    return bad


def _atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, prefix=".pending-", delete=False) as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
        tmp = stream.name
    os.replace(tmp, path)


def count_lines(repo, ref):
    n = 0
    for f in git(repo, "ls-tree", "-r", "--name-only", ref).stdout.splitlines():
        low = f.lower()
        if not f.endswith(SRC_EXT + (".sol",)) or "test" in low or "fixture" in low or low.startswith(("dist/", "node_modules/")):
            continue
        n += (show(repo, ref, f) or "").count("\n")
    return n


def gate_size(rs, ref, state_path, timings=None):
    now = {}
    for repo in rs:
        tick = time.perf_counter()
        now[os.path.basename(repo)] = count_lines(repo, ref)
        if timings is not None:
            timings[os.path.basename(repo)] = time.perf_counter() - tick
    # Legacy history is read-only. Each run writes its own immutable atomic snapshot.
    hist = json.loads(Path(state_path).read_text()) if os.path.exists(state_path) else []
    directory = Path(state_path + ".snapshots")
    if directory.exists():
        hist += [json.loads(p.read_text()) for p in sorted(directory.glob("*.json"))]
    week_ago = time.time() - 7 * 86400
    warn = []
    for k, v in now.items():
        candidates = sorted((h for h in hist if k in h["counts"]), key=lambda h: h["t"])
        if not candidates:
            continue
        older = [h for h in candidates if h["t"] <= week_ago]
        base = older[-1] if older else candidates[0]
        b = base["counts"][k]
        if b and v > b * 1.3:
            warn.append(f"{k}: 非测试代码 {b} → {v} 行（+{(v - b) * 100 // b}%，基线 {time.strftime('%m-%d', time.localtime(base['t']))}）")
    stamp = time.time_ns()
    _atomic_json(directory / f"{stamp}-{os.getpid()}.json", {"t": stamp / 1e9, "counts": now,
        "trees": {os.path.basename(r): git(r, "rev-parse", f"{ref}^{{tree}}").stdout.strip() for r in rs}})
    return warn


def gate_docs(docs, ref):
    warn = []
    for f in git(docs, "ls-tree", "-r", "--name-only", ref, "--", "contracts").stdout.splitlines():
        if f.endswith(".md"):
            head = "\n".join((show(docs, ref, f) or "").splitlines()[:8])
            if "候选" in head:
                warn.append(f"{f}: 页首仍写「候选」，核对是否已合 main 应改「现行」")
    return warn


# AUD1 §C.6 列出的特征。每项：(名称, 新增行要命中的正则, 同一文件在 <ref> 上还须全部出现的正则)
HG_WX = re.compile(r"\bopen\s*\([^)]*['\"]wx['\"]")
HG_WATCH = re.compile(r"\b(?:fs\.)?watch\s*\(")
HOMEGROWN = [
    ("直接读 window.ethereum（应走 wagmi/EIP-6963）", re.compile(r"\bwindow\b[^;\n]*?\.ethereum\b"), []),
    ("useEffect 取数 + let live/active=true（应走取数缓存库）", re.compile(r"\blet\s+(?:live|active)\s*=\s*true\b"), [re.compile(r"\buseEffect\s*\(")]),
    ("React key 里出现 revision", re.compile(r"\bkey=\{(?:[^{}]|\{[^{}]*\})*?(?:\{[^{}]*)?revision", re.I), []),
    ("fs.watch 搭配 open(...,'wx') 手写文件锁（应走 proper-lockfile）", re.compile(f"{HG_WX.pattern}|{HG_WATCH.pattern}"), [HG_WX, HG_WATCH]),
    ("新增 setInterval( 作业调度（应走 croner protect 等调度器）", re.compile(r"\bsetInterval\s*\("), []),
    ("手写 retry-after / x-ratelimit 解析（应走 octokit 插件或 p-retry）", re.compile(r"['\"`](?:retry-after|x-ratelimit-[a-z-]*)['\"`]", re.I), []),
    ("手写 origin!== 比对（应走 Hono csrf()）", re.compile(r"\borigin\s*!==?|!==?\s*[\w.]*\borigin\b", re.I), []),
]


def gate_homegrown(rs, ref, main_ref):
    """只看 <main-ref>...<ref> 的新增行（git diff 三点：自分叉点起的净新增），非测试源文件；<ref> 不存在的仓跳过。"""
    warn = []
    for repo in rs:
        if git(repo, "rev-parse", "--verify", "-q", f"{ref}^{{commit}}", check=False).returncode != 0:
            continue
        r = git(repo, "diff", "-U0", "--no-color", "--no-ext-diff", f"{main_ref}...{ref}", check=False)
        if r.returncode != 0:
            warn.append(f"{os.path.basename(repo)}: 无法对比 {main_ref}...{ref}：{r.stderr.strip()[:160]}")
            continue
        added, f, line = {}, None, 0
        for l in r.stdout.splitlines():
            if l.startswith("+++ "):
                f = l[6:] if l.startswith("+++ b/") else None
            elif l.startswith("@@"):
                line = int(re.search(r"\+(\d+)", l).group(1))
            elif l.startswith("+") and f:
                added.setdefault(f, []).append((line, l[1:]))
                line += 1
        for f, lines in added.items():
            low = f.lower()
            if not f.endswith(SRC_EXT) or "test" in low or "fixture" in low or "node_modules/" in low or low.startswith("dist/") or "/dist/" in low:
                continue
            text = None
            for label, pat, need in HOMEGROWN:
                hit = next(((n, t) for n, t in lines if pat.search(t)), None)
                if not hit:
                    continue
                if need:
                    text = (show(repo, ref, f) or "") if text is None else text
                    if not all(n.search(text) for n in need):
                        continue
                warn.append(f"{os.path.basename(repo)} {f}:{hit[0]} {label}：{hit[1].strip()[:120]}")
    return warn


def _cycles_cached(repo, ref, cache_dir):
    tree = git(repo, "rev-parse", f"{ref}^{{tree}}").stdout.strip()
    inputs = {"repo": os.path.basename(repo), "tree": tree, "node": subprocess.run(["node", "--version"], capture_output=True, text=True, check=True).stdout.strip()}
    for f in ("gates.py", "cycles.cjs", "package-lock.json"):
        inputs[f] = hashlib.sha256(Path(HERE, f).read_bytes()).hexdigest()
    key = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
    path = Path(cache_dir, key + ".json") if cache_dir else None
    if path and path.exists():
        return json.loads(path.read_text())["items"], True, key
    items = gate_cycles([repo], ref)
    if path:
        _atomic_json(path, {"inputs": inputs, "items": items})
    return items, False, key


def _repo_scope(path):
    """Read the orchestrator's authoritative TSV; only 在范围 may expand pins."""
    rows = {}
    for number, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        fields = line.split("\t")
        if len(fields) < 2 or not fields[0] or fields[0] in rows or fields[1] not in {"在范围", "冻结", "退休", "不在范围", "待确认"}:
            raise ValueError(f"repo-scope 格式错误或重复仓：{path}:{number}")
        rows[fields[0]] = fields[1]
    if not rows:
        raise ValueError(f"repo-scope 为空：{path}")
    return rows


def _pin_consumers(selected, lookup, ref, main_ref, scope=None, skip=()):
    """Direct and transitive formal git consumers; consumer-only refs use main if absent."""
    refs = {r: ref for r in selected}
    while True:
        names = {os.path.basename(r) for r in refs}
        packages = set()
        for repo, rf in refs.items():
            for mf in _manifests(repo, rf):
                name = json.loads(show(repo, rf, mf) or "{}").get("name")
                if name:
                    packages.add(name)
        added = {}
        for repo in lookup:
            name = os.path.basename(repo)
            if repo in refs or name in skip or (scope is not None and scope.get(name) != "在范围"):
                continue
            rf = ref if git(repo, "rev-parse", "--verify", "-q", f"{ref}^{{commit}}", check=False).returncode == 0 else main_ref
            for mf in _manifests(repo, rf):
                pj = json.loads(show(repo, rf, mf) or "{}")
                if any(dep in packages or ((m := GIT_DEP.match(spec)) and m[1] in names) for _, dep, spec in _git_deps(pj)):
                    added[repo] = rf
                    break
        if not added:
            return refs
        refs.update(added)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.expanduser("~/work/projects/hanamesh"))
    ap.add_argument("--docs", default=os.path.expanduser("~/work/hanamesh-docs"))
    ap.add_argument("--ref", default="origin/main")
    ap.add_argument("--main-ref", default="origin/main")
    ap.add_argument("--only", default="retired,pins,deep,cycles,size,docs,homegrown")
    ap.add_argument("--no-fetch", action="store_true")
    ap.add_argument("--state", default=os.path.join(HERE, "size-history.json"), help="只读旧 history；新快照写入 <state>.snapshots/")
    ap.add_argument("--retired", default=os.path.join(HERE, "retired-names.txt"))
    ap.add_argument("--prefix", default="hanamesh-")
    ap.add_argument("--skip", default="hanamesh-app-vibe-trading")
    ap.add_argument("--scope", default="@hanamesh")
    ap.add_argument("--repo-scope", help="反向消费者范围 TSV；默认读取 --docs/tools/repo-scope.txt（若存在）")
    ap.add_argument("--repos", action="append", help="明确改动仓列表，逗号分隔，可重复；pins 自动扩展正式反向消费者")
    ap.add_argument("--json", dest="json_path", help="JSON 收据路径，- 表示仅 stdout JSON")
    ap.add_argument("--cache-dir", default=os.path.join(HERE, "cache"), help="cycles 输入 hash 缓存")
    ap.add_argument("--no-cache", action="store_true")
    a = ap.parse_args()
    known = ("retired", "pins", "deep", "cycles", "size", "docs", "homegrown")
    only = a.only.split(",")
    if not only or set(only) - set(known):
        ap.error("--only 包含未知门或为空")
    lookup = repos(a.root, "", set())
    skip = set(filter(None, a.skip.split(",")))
    rs = repos(a.root, a.prefix, skip)
    if a.repos is not None:
        names = set(n for entry in a.repos for n in entry.split(",") if n)
        by_name = {os.path.basename(r): r for r in lookup}
        if not names or names - by_name.keys():
            ap.error("--repos 为空或包含不存在的仓：" + ",".join(sorted(names - by_name.keys())))
        rs = [by_name[n] for n in sorted(names)]
    if not rs:
        ap.error("仓列表为空，不能空清单 PASS")
    docs = a.docs if a.docs and os.path.exists(os.path.join(a.docs, ".git")) else None
    scope_path = a.repo_scope or (os.path.join(a.docs, "tools", "repo-scope.txt") if a.docs else None)
    scope = None
    if scope_path and (a.repo_scope is not None or os.path.exists(scope_path)):
        try:
            scope = _repo_scope(scope_path)
        except (OSError, ValueError) as e:
            ap.error(str(e))
    start = time.perf_counter()
    # Fetch selected repos, formal consumers and local dependency providers once; do not fetch all sources.
    pin_refs = _pin_consumers(rs, lookup, a.ref, a.main_ref, scope, skip) if "pins" in only else {}
    fetched = set()
    while True:
        fetch_set = set(rs) | set(pin_refs)
        if "pins" in only:
            by_name = {os.path.basename(r): r for r in lookup}
            for repo, rf in pin_refs.items():
                for mf in _manifests(repo, rf):
                    for _, _, dep in _git_deps(json.loads(show(repo, rf, mf) or "{}")):
                        m = GIT_DEP.match(dep)
                        if m and m[1] in by_name:
                            fetch_set.add(by_name[m[1]])
        if docs and set(only) & {"docs", "retired"}:
            fetch_set.add(docs)
        pending = fetch_set - fetched
        if a.no_fetch or not pending:
            break
        for repo in sorted(pending):
            git(repo, "fetch", "-q", "--tags", "origin")
        fetched.update(pending)
        pin_refs = _pin_consumers(rs, lookup, a.ref, a.main_ref, scope, skip) if "pins" in only else {}
    result = {"ref": a.ref, "mainRef": a.main_ref, "selectedRepos": [os.path.basename(r) for r in rs],
              "pinConsumers": [os.path.basename(r) for r in pin_refs if r not in rs],
              "pinScope": {"path": scope_path if scope is not None else None, "statuses": scope,
                           "skip": sorted(skip)}, "results": [], "repositories": {}}
    failed = False

    def record(name, repo, rf, fn, hard, cached=False, key=None):
        nonlocal failed
        tick = time.perf_counter()
        try:
            if name == "cycles":
                items, cached, key = _cycles_cached(repo, rf, None if a.no_cache else a.cache_dir)
            else:
                items = fn()
            status = "PASS" if not items else ("FAIL" if hard else "WARN")
        except (RuntimeError, ValueError, OSError, subprocess.SubprocessError) as e:
            items, status = [str(e)], "FAIL"
        elapsed = time.perf_counter() - tick
        entry = {"gate": name, "repo": os.path.basename(repo) if repo else "selected-repositories", "ref": rf,
                 "status": status, "items": items, "seconds": elapsed, "cached": cached}
        if repo:
            entry["commit"] = git(repo, "rev-parse", f"{rf}^{{commit}}", check=False).stdout.strip()
            entry["tree"] = git(repo, "rev-parse", f"{rf}^{{tree}}", check=False).stdout.strip()
        if key:
            entry["inputHash"] = key
        result["results"].append(entry)
        result["repositories"][entry["repo"]] = result["repositories"].get(entry["repo"], 0) + elapsed
        failed |= status == "FAIL"

    for name in only:
        if name == "pins":
            for repo, rf in pin_refs.items():
                record(name, repo, rf, lambda: gate_pins([repo], rf, a.main_ref, lookup), True)
        elif name == "docs":
            if docs:
                record(name, docs, a.ref, lambda: gate_docs(docs, a.ref), False)
        elif name == "size":
            # One atomic snapshot per invocation, covering exactly the selected repositories.
            timings = {}
            record(name, None, a.ref, lambda: gate_size(rs, a.ref, a.state, timings), False)
            for repo, seconds in timings.items():
                result["repositories"][repo] = result["repositories"].get(repo, 0) + seconds
        else:
            for repo in rs:
                functions = {
                    "retired": lambda: gate_retired([repo], a.ref, None, a.retired, a.main_ref),
                    "deep": lambda: gate_deep([repo], a.ref, a.scope, lookup, a.main_ref),
                    "cycles": lambda: [],
                    "homegrown": lambda: gate_homegrown([repo], a.ref, a.main_ref),
                }
                record(name, repo, a.ref, functions[name], name in ("retired", "deep", "cycles"))
            if name == "retired" and docs:
                record(name, docs, a.main_ref, lambda: gate_retired([], a.ref, docs, a.retired, a.main_ref), True)
    result.update({"seconds": time.perf_counter() - start, "exitCode": 1 if failed else 0})
    if a.json_path:
        if a.json_path == "-":
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            _atomic_json(a.json_path, result)
    if a.json_path != "-":
        for name in only:
            entries = [r for r in result["results"] if r["gate"] == name]
            items = [it for r in entries for it in r["items"]]
            status = "FAIL" if any(r["status"] == "FAIL" for r in entries) else "WARN" if items else "PASS"
            print(f"[{status}] {name}: {len(items)}")
            for it in items:
                print("   - " + it)
        for repo, seconds in result["repositories"].items():
            print(f"[TIME] {repo}: {seconds:.3f}s")
    sys.exit(result["exitCode"])


if __name__ == "__main__":
    main()
