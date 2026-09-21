# Paper Reader

面向论文阅读的 Windows 11 PDF 阅读器 MVP。

## 已实现

- 打开或拖放本地 PDF，并提供可选择文本的连续阅读视图。
- 按可视区域懒渲染 PDF 页面，打开长文档时只加载当前页附近的页面。
- 支持点击 PDF 内部链接跳转到 reference、脚注或目录目标；外部网页链接交给系统浏览器打开。
- 支持多页签打开多个 PDF，每个页签独立保存阅读位置、缩放、标注和生词，可单独关闭。
- 支持按页签隔离的阅读视图前进 / 后退，点击 reference 后可返回正文位置。
- `H` 快速高亮当前选区；`1` 至 `4` 可直接选择高亮颜色。
- 双击英文单词或选择文本后按 `D` 查看音标与释义。
- 内置 ECDICT 离线英汉词典，包含约 77 万词条、音标、中英文释义和词形变化。
- 标注侧栏、生词本、缩放、页码跳转、撤销和阅读位置恢复。
- 标注和生词按 PDF 内容哈希保存在 Electron 用户数据目录。
- Windows x64 NSIS 安装包。

## 快捷键

| 快捷键 | 操作 |
| --- | --- |
| `H` | 使用当前颜色高亮选区 |
| `1` / `2` / `3` / `4` | 用黄 / 珊瑚 / 绿 / 蓝高亮选区 |
| `D` | 查询当前选中的单词或短语 |
| `Ctrl` + 鼠标滚轮 | 以 10% 步进缩放 PDF 页面 |
| `Ctrl+Z` | 撤销上一步标注或生词操作 |
| `Delete` | 删除侧栏中选中的标注 |
| `Esc` | 取消选区或关闭当前选择 |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | 切换下一个 / 上一个 PDF 页签 |
| `Ctrl+W` | 关闭当前 PDF 页签 |

## 开发

项目主要代码按职责分层：

- `src/components/`：阅读器界面、PDF 页面、页签、工具栏和侧栏组件。
- `src/services/`：离线词典查询和阅读状态持久化。
- `src/types.ts`：跨组件共享的数据结构。
- `electron/`：Windows 桌面壳层、文件选择、IPC 和本地状态存储。
- `public/dictionary/`：ECDICT 生成的离线词典分片。

需要 Node.js 22.13 或更高版本，以及 pnpm。

```powershell
pnpm install
pnpm dev
```

离线词库数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)，按 MIT 许可证分发。若需从原始 `ecdict.csv` 重新生成分片：

```powershell
pnpm dictionary:build
```

生产构建和 Windows 安装包：

```powershell
pnpm build
pnpm package:win
```

安装包输出到 `release/Paper Reader Setup 0.1.0.exe`。

## 自动发布 GitHub Release

仓库配置了 GitHub Actions。发布新版本时，先把 `package.json` 中的版本号改成目标版本并提交，然后创建同名标签：

```powershell
git tag v0.1.0
git push origin v0.1.0
```

推送 `vMAJOR.MINOR.PATCH` 标签后，Windows runner 会自动执行类型检查、构建 NSIS 安装包，并创建 GitHub Release。Release 会包含 `.exe` 安装包、`.blockmap` 和更新元数据文件。也可以在 GitHub Actions 页面手动运行 workflow，但输入的标签必须已经存在，并且必须与 `package.json` 的版本一致。

如果仓库的 Actions 权限默认为只读，请在 GitHub 的 `Settings → Actions → General → Workflow permissions` 中允许 `Read and write permissions`，否则 workflow 无法创建 Release。

## 当前边界

- 离线词典不依赖网络；少量专有名词、最新缩写或领域术语可能没有收录。
- 标注保存在应用数据中，尚未写回原 PDF；后续应提供“导出带标准 PDF 标注的副本”。
- 当前安装包未使用商业代码签名证书，直接分发时 Windows 可能显示未知发布者提示。
