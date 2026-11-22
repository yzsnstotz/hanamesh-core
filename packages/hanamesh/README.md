# @hanamesh/hanamesh

当前 DSH 桌面套件使用独立的 Core、Usage、Market 和 Theme 插件。安装与启用请参见 [Core README](https://github.com/yzsnstotz/hanamesh-core#readme)。本目录的 `package.json`、`cordis.patch.yml` 和 `release.json` 是历史聚合发布记录。

如需构建新的聚合候选，`build.mjs` 以本仓的 Core 套件声明确定成员。为每个成员提供对应的精确 npm 版本，并指定新归档版本和绝对输出目录。本版参数为 `--version`、`--core`、`--usage`、`--market`、`--theme` 和 `--output`。生成器核对 Core 归档内的声明、成员版本、patch 及 DSH peer，`release.json` 记录实际输入的 SHA-256。Core 的运行时套件声明为通过检查的聚合升级给出精确安装定义。
