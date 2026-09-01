# dsh-schedule

[![CI](https://github.com/csiroqa/dsh-schedule/actions/workflows/ci.yml/badge.svg)](https://github.com/csiroqa/dsh-schedule/actions/workflows/ci.yml)

> 本仓库 fork 自 [csiroqa/dsh-schedule](https://github.com/csiroqa/dsh-schedule)。全部原始功能、设计与实现均归功于原作者 **csiroqa**；本 fork 仅在其基础上修复了下文列出的安全问题。原始项目与许可见上游仓库。

DeepSeek Harness（DSH）的**定时任务 + 状态监控**插件：按 cron 时间表自动触发 Agent 执行任务（每日摘要、定时巡检、自动报告），并通过 `/status` 命令与设置页仪表盘查看系统与 harness 综合状态。

English: [README.en.md](README.en.md)

## 功能

### 定时任务
- **cron 时间表**（5 字段：分 时 日 月 周，如 `0 9 * * *` = 每天 9 点）：ticker 定期检查，命中即触发，分钟精度，同任务不并发
- **自动执行**：到点创建一次性 Agent（工作目录归入对应 workspace，模型跟随设置页选择或由 config 指定），执行任务内容，会话日志落盘（侧栏可查），结果登记回任务记录
- **任务管理**：`/schedule list / add / remove / pause / resume / run`，设置页「定时任务」页签同功能
- **超时保护**：单次运行超时（默认 30 分钟）自动强制停止，避免任务卡死
- **持久化**：任务记录存于 `$DSH_HOME/schedule.json`（原子写入，启动安全）

### 状态监控

- `/status`：进程运行时长 / CPU / 内存 / 磁盘 / 活跃会话 / Agent / 插件 / 模型
- 设置页「状态」页签：实时仪表盘（每 5 秒刷新，可暂停），CPU/内存/磁盘占用条

## 配置

插件行（`cordis.patch.yml` 的 `schedule` insert 行）支持以下可选 config：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `defaultCwd` | DSH 进程启动目录 | 任务默认工作目录 |
| `defaultProvider` / `defaultModel` | 设置页的模型选择 | 任务默认模型服务商与模型 |
| `tickSeconds` | `30` | 定时检查任务的时间间隔（秒） |
| `maxRunMs` | `1800000`（30 分钟） | 单次任务运行超时（毫秒）；`0` = 不限时 |

## 安装

前置：Node.js >= 22、pnpm、本机 `deepseek-harness` 源码检出（依赖以 `link:` 指向 `../deepseek-harness`）。

```sh
git clone https://github.com/csiroqa/dsh-schedule.git
cd dsh-schedule
pnpm install
pnpm build

# 安装进 web profile（link: 指向本目录）
dsh plugin --profile web add link:$(pwd)        # POSIX
dsh plugin --profile web add link:E:\path\to\dsh-schedule   # Windows
```

重启 `dsh web`，浏览器 **Ctrl+F5** 硬刷新。

## 使用

1. 侧栏输入 `/schedule list` 查看任务；`/schedule add 0 9 * * * 每天 9 点总结昨天的进展` 添加任务
2. 设置 > 插件 > **定时任务**：可视化添加 / 立即运行 / 暂停 / 恢复 / 删除
3. 设置 > 插件 > **状态**：系统与 harness 实时仪表盘
4. `/status`：会话内查看综合状态

## 兼容性

- **平台**：Windows / macOS / Linux（Node >= 22）—— 三平台构建与冒烟测试经 [GitHub Actions CI](https://github.com/csiroqa/dsh-schedule/actions) 验证
- **磁盘统计**：三平台经 `node:fs` `statfs`（Windows 走系统磁盘空间 API）；平台不支持时优雅降级（显示"不支持"）
- 针对 DSH `0.1.1-rc.2` 源码检出开发验证，并在 `@deepseek-ai/dsh@0.1.1-rc.2`（npm 全局/npx 安装）环境实测可用
- 客户端仅依赖平台模块表（react 等），不随 DSH SDK 版本漂移
- 构建产物：`tsdown`（host 半区 `lib/index.js` + browser 半区 `lib/client.js`，标准 `window.__ModuleLoader__.load` 闭包工厂格式）

## 本 Fork 的改动（相对上游 csiroqa/dsh-schedule）

安全扫描发现 `POST /dsh-schedule/tasks`（设置页新增/删除/暂停/恢复/立即运行任务的接口）仅做了"回环绑定"这一层防护，未校验请求来源。由于该接口触发的任务以 **DSH 当前账号的完整权限**无人值守执行 agent，浏览器里任意打开的网页都可能通过跨站请求伪造（CSRF）——包括绕过预检的经典 `Content-Type: text/plain` 表单技巧——静默地新增或立即运行一个任务，等同于本机任意代码执行。

修复（`src/http.ts`）：
- **严格校验 `Content-Type` 必须为 `application/json`**（忽略大小写与 `charset` 等参数），拒绝 `text/plain`/`application/x-www-form-urlencoded` 等会绕过浏览器跨源预检的编码方式。
- **校验 `Origin` 与 `Host` 同源**：带 `Origin` 头且与 `Host` 不一致（跨站请求必然如此）时拒绝（403）；本机脚本等不带 `Origin` 头的调用仍视为可信，不受影响。
- 已确认 DSH 的 `host/webserver` 框架本身不做任何 Origin/CORS 校验，因此该防护必须在插件路由层实现。
- 新增 `src/http.spec.ts` 覆盖上述两项校验的边界情况。

其余功能与实现均未改动，全部归功于原作者。

## 安全说明

- **定时任务会在设定时间无人值守自动执行**（使用 DSH 当前账号权限，可读写你的文件、执行命令），请只添加你信任的任务内容
- `/dsh-schedule/*` 接口仅监听本机（DSH 默认回环绑定），请勿把 DSH 端口暴露到公网
- `POST /dsh-schedule/tasks` 额外校验 `Content-Type` 与 `Origin`/`Host` 同源，防止浏览器跨站请求伪造（见上方"本 Fork 的改动"）

## 许可与使用声明

**MIT License**（见 [LICENSE](LICENSE)）。

欢迎任何人**使用、修改、引用、或把本项目收录进自己的插件合集**，只需：

- 保留 `LICENSE` 文件与版权声明
- 标明出处（本仓库链接）

## 相关

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- 同系列插件：[dsh-archive-viewer](https://github.com/csiroqa/dsh-archive-viewer)（归档增强：自动归档 / 文件夹 / 经验库 / 收藏便签）
- 插件形态参考 [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui)（`dsh.bundle.patch` + `dsh.client` 声明 + 槽位注册 + tsdown 双半区构建）
