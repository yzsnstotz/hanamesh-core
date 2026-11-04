#!/usr/bin/env python3
"""HanaMesh 机器门（《编排工作法》§3.5 第 2 层）。只读：读各仓 <ref> 上的内容，不动工作树。

门：
  retired  退休名单里的名字不许出现（R12）
  pins     git 依赖只许 #semver: 标签范围（提交/分支/标签/其它写法 FAIL）；满足范围的标签须在上游 main 上；锁文件不许 SSH 形、解析提交须是满足范围的 main 标签；含子包（owner 10-31 追加定案）
  deep     不许 import 别的 @hanamesh 包未导出的子路径（§3 第 9 条）
  cycles   仓内无循环依赖（dependency-cruiser）
  size     非测试代码行数周增长 >30% 报警（R8，只报警不失败）
  docs     合约页仍写「候选」的列出来（§3 第 11 条，只报警不失败）

退出码：任一失败门 → 1。
"""
import argparse, fnmatch, json, os, re, subprocess, sys, tarfile, tempfile, time, io

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
        if name.startswith(prefix) and name not in skip and os.path.isdir(os.path.join(p, ".git")):
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
    picked += sorted(f for f in files if f != "package.json" and "node_modules/" not in f and any(fnmatch.fnmatchcase(f, g) for g in globs))
    return picked


def _locked_commits(lock, dep, spec):
    """锁文件 importers 里 dep 的 specifier=spec 对应的 version 行所解析的提交。"""
    pat = re.compile(r"^\s+'?" + re.escape(dep) + r"'?:\n\s+specifier: '?" + re.escape(spec) + r"'?\n\s+version: '?(\S+?)'?$", re.M)
    return [re.search(r"#([0-9a-f]{40})", v).group(1) if re.search(r"#([0-9a-f]{40})", v) else None for v in pat.findall(lock)]


def gate_pins(rs, ref, main_ref, lookup=None):
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
        lock = show(repo, ref, "pnpm-lock.yaml")
        if lock and "git@github.com:" in lock:
            bad.append(f"{name} 锁文件出现 {lock.count('git@github.com:')} 处 git@github.com:（SSH 形），须禁用 SSH 重生成为 HTTPS 形")
        for mf in _manifests(repo, ref):
            raw = show(repo, ref, mf)
            if not raw:
                continue
            try:
                pj = json.loads(raw)
            except ValueError as e:
                bad.append(f"{name}/{mf} 无法解析：{e}")
                continue
            here = name if mf == "package.json" else f"{name}/{mf[:-len('/package.json')]}"
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
                if not target:
                    bad.append(f"{where}：本机没有 {dep_repo} 仓，无法核对标签")
                    continue
                hits, unsupported = [], False
                for t, c in tags_on(dep_repo, target).items():
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
                    r = git(target, "merge-base", "--is-ancestor", c, main_ref, check=False)
                    if r.returncode != 0:
                        bad.append(f"{where}：满足范围的标签 {t} 不在 {dep_repo} 的 {main_ref} 上")
                    else:
                        good.add(c)
                if sec == "peerDependencies" or not lock:
                    continue
                locked = _locked_commits(lock, dep, spec)
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


def gate_deep(rs, ref, scope):
    IMPORT = import_re(scope)
    pkgs = {}
    for repo in rs:
        pj = show(repo, ref, "package.json")
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
        dirs = [d for d in git(repo, "ls-tree", "-d", "-r", "--name-only", ref).stdout.split()
                if d.endswith("src") and d.count("/") <= 1 and os.path.basename(d) == "src"]  # src 或 <包>/src（如 web/src）
        for src in dirs:
            with tempfile.TemporaryDirectory(prefix="gates-") as tmp:
                data = subprocess.run(["git", "-C", repo, "archive", ref, src], capture_output=True, check=True).stdout
                tarfile.open(fileobj=io.BytesIO(data)).extractall(tmp)  # 自家仓 git archive，内容可信
                r = subprocess.run([bin_, "--config", os.path.join(HERE, "cycles.cjs"),
                                    "--output-type", "err", src], cwd=tmp, capture_output=True, text=True, env={**os.environ, "NODE_PATH": os.path.join(HERE, "node_modules")})
                if r.returncode != 0:
                    msg = " | ".join(l.strip() for l in r.stdout.splitlines() if "no-circular" in l)[:400]
                    bad.append(f"{os.path.basename(repo)} {src}: 循环依赖 {msg or r.stdout.strip()[:400] or r.stderr.strip()[:400]}")
    return bad


def count_lines(repo, ref):
    n = 0
    for f in git(repo, "ls-tree", "-r", "--name-only", ref).stdout.splitlines():
        low = f.lower()
        if not f.endswith(SRC_EXT + (".sol",)) or "test" in low or "fixture" in low or low.startswith(("dist/", "node_modules/")):
            continue
        n += (show(repo, ref, f) or "").count("\n")
    return n


def gate_size(rs, ref, state_path):
    now = {os.path.basename(r): count_lines(r, ref) for r in rs}
    hist = json.load(open(state_path)) if os.path.exists(state_path) else []
    week_ago = time.time() - 7 * 86400
    base = next((h for h in reversed(hist) if h["t"] <= week_ago), hist[0] if hist else None)
    warn = []
    if base:
        for k, v in now.items():
            b = base["counts"].get(k)
            if b and v > b * 1.3:
                warn.append(f"{k}: 非测试代码 {b} → {v} 行（+{(v - b) * 100 // b}%，基线 {time.strftime('%m-%d', time.localtime(base['t']))}）")
    hist.append({"t": time.time(), "counts": now})
    json.dump(hist[-60:], open(state_path, "w"), ensure_ascii=False)
    return warn


def gate_docs(docs, ref):
    warn = []
    for f in git(docs, "ls-tree", "-r", "--name-only", ref, "--", "contracts").stdout.splitlines():
        if f.endswith(".md"):
            head = "\n".join((show(docs, ref, f) or "").splitlines()[:8])
            if "候选" in head:
                warn.append(f"{f}: 页首仍写「候选」，核对是否已合 main 应改「现行」")
    return warn


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.expanduser("~/work/projects/hanamesh"))
    ap.add_argument("--docs", default=os.path.expanduser("~/work/hanamesh-docs"))
    ap.add_argument("--ref", default="origin/main")
    ap.add_argument("--main-ref", default="origin/main")
    ap.add_argument("--only", default="retired,pins,deep,cycles,size,docs")
    ap.add_argument("--no-fetch", action="store_true")
    ap.add_argument("--state", default=os.path.join(HERE, "size-history.json"))
    ap.add_argument("--retired", default=os.path.join(HERE, "retired-names.txt"), help="退休名单（项目自己的，放项目 docs 仓）")
    ap.add_argument("--prefix", default="hanamesh-", help="只扫 --root 下以此开头的 git 仓")
    ap.add_argument("--skip", default="hanamesh-app-vibe-trading", help="逗号分隔，跳过的仓名")
    ap.add_argument("--scope", default="@hanamesh", help="包作用域，用于深层 import 检查")
    a = ap.parse_args()
    rs = repos(a.root, a.prefix, set(filter(None, a.skip.split(","))))
    docs = a.docs if a.docs and os.path.isdir(os.path.join(a.docs, ".git")) else None
    if not a.no_fetch:
        for r in rs + ([docs] if docs else []):
            git(r, "fetch", "-q", "--tags", "origin")
    only = a.only.split(",")
    failed = False
    for name, fn, hard in [
        ("retired", lambda: gate_retired(rs, a.ref, docs, a.retired, a.main_ref), True),
        ("pins", lambda: gate_pins(rs, a.ref, a.main_ref, repos(a.root, "hanamesh-", set())), True),
        ("deep", lambda: gate_deep(rs, a.ref, a.scope), True),
        ("cycles", lambda: gate_cycles(rs, a.ref), True),
        ("size", lambda: gate_size(rs, a.ref, a.state), False),
        ("docs", lambda: gate_docs(docs, a.ref) if docs else [], False),
    ]:
        if name not in only:
            continue
        items = fn()
        tag = "PASS" if not items else ("FAIL" if hard else "WARN")
        print(f"[{tag}] {name}: {len(items)}")
        for it in items:
            print("   - " + it)
        failed |= hard and bool(items)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
