// dependency-cruiser 官方 no-circular 规则（照搬其 recommended 预设）。
// tsPreCompilationDeps=false：只看运行时依赖，纯类型互引（import type）不算循环。
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
  ],
  options: { doNotFollow: { path: "node_modules" }, tsPreCompilationDeps: false },
};
