# Paper QueryGen

![Web前端展示](assets/images/webapp.png)

一个基于 Flask 的本地网页小工具，用来辅助为学术检索系统（尤其是 Agentic RAG）生成查询评测数据。

平时看 arXiv 论文时，你可能需要积累一些 Benchmark 数据来测 RAG 系统。这玩意儿可以随机抽取你本地准备好的 arXiv Parquet 里的论文，让你通过点按钮的方式，**自动请求大模型为这篇论文生成几组用户视角的自然语言 Query**，然后直接存入 `research_queries.csv`。

核心就是解决“手动想 Query -> 跑大模型 -> 复制粘贴进 CSV”这个繁琐的流程，并且加了异步生成队列，可以直接“点击生成 -> 下一篇”，不用硬干等着。

## 必备要求

### 1. Parquet 数据格式
脚本默认读取根目录或指定路径下的 `arxiv-metadata-oai-snapshot.parquet` 文件。
你的 `.parquet` 文件中必须包含（或能够容错读取）以下列（因为代码前端渲染和组装 Prompt 需要）：
- `id`: 文章的 arxiv id (例如 "2401.00001")
- `title`: 文章标题
- `abstract`: 摘要
- `authors`: 作者信息
- `update_date`: 更新日期（或发表/创建日期）
- `categories`: 学术分类 (例如 "cs.CL")
- *(可选)* `journal-ref`, `doi`, `versions` 等信息也会显示在网页上。

### 2. config.json 配置文件
在与脚本同级的目录下，必须新建一个 `config.json` 来放 LLM 的调用配置：
```json
{
  "LLM_API_KEY": "sk-xxxxxx",
  "LLM_API_BASE": "https://api.openai.com/v1",
  "LLM_MODEL": "gpt-4o"
}
```

## 如何使用

**前置要求:** 请确保你的本地环境安装了 **Python 3.8 或更高版本**（推荐 Python 3.9+）。

1. 创建并激活虚拟环境（推荐）：

   **macOS / Linux:**
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```

   **Windows:**
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   ```

2. 装好依赖：
   ```bash
   pip install flask pandas requests
   ```
3. 把你的 `arxiv-metadata-oai-snapshot.parquet` 和 `config.json` 准备好。
3. 运行：
   ```bash
   python arxiv_querygen.py
   ```
4. 浏览器打开 `http://127.0.0.1:5050`

> **⏳ 首次打开加载提示**  
> 当你第一次在浏览器中打开页面时，系统需要将庞大的 `.parquet` 数据集文件整个读入内存。
> 这个过程通常需要等待几秒到几十秒不等（取决于你的 Parquet 文件大小和硬盘读写速度），期间页面会显示加载动画，请耐心等待第一篇论文内容刷新出来。
> 
> ![首次加载内存等待示意图](assets/images/initial_loading.png)

程序包含**手动模式**和**自动模式**两种操作方式，满足不同的使用场景：

### 手动模式（精确筛选）
适合需要人工审阅、精细控制生成质量的场景。
- 点击 **“🎲 随机挑选一个”** 刷新下一篇文章。
- 如果你不确定这篇论文是否适合用来生成 Query，可以点击 **“🔍 自动评估适用性”** 让大模型帮你快速判断。

  ![AI 自动评估适用性效果展示](assets/images/ai_eval.png)

- 认为合适后，点击 **“💻 自动生成并存入CSV”** 即可触发 LLM 请求，它会在后台排队处理。

### 自动模式（批量处理）
适合希望无人值守、快速批量积累 Benchmark 数据的场景。
- 开启自动模式后，系统会自动在后台随机抽取论文。
- 自动进行论文适用性评估，如果大模型判断适合，则自动发起 Query 生成并存入 CSV；如果不适合则自动跳过并处理下一篇。
- **配置参数说明：**
  - **生成目标数量**：你需要成功生成的 Query 组数（例如 50，系统会在成功生成 50 组后自动结束任务）。
  - **最大尝试倍率**：防止因大量论文不合格而导致的死循环抽样。系统最大抽样尝试次数为 `目标数量 × 该倍率`（例：目标50，倍率2，则最多抽取 100 篇论文，若仍未达到设定目标也会报错停止）。
  - **API错误最大重试**：遇到网络抖动或大模型 API 报错时，针对当前单次请求允许的最大重试次数。

![自动模式运行日志或界面展示](assets/images/auto_mode.png)

无论是手动还是自动模式，页面下方都有队列提示悬浮窗，如果成功、报错或者网络出现状况，都会有小气泡提醒。
