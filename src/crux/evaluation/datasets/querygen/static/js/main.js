let isAutoRunning = false; // 标记自动模式是否正在执行

        // 模式切换
        function toggleMode() {
            const bg = document.getElementById('modeToggleBg');
            const manualSec = document.getElementById('manual-mode-section');
            const autoSec = document.getElementById('auto-mode-section');
            
            if (bg.classList.contains('auto')) {
                // 如果在自动模式且正在运行，阻止切换并弹窗提示
                if (isAutoRunning) {
                    alert(`⚠️ 警告：当前正有自动生成任务在进行中！\n请先点击【⏹ 停止并结算】终止任务，然后再切换回手动模式。`);
                    return;
                }
                
                // 回到手动模式
                bg.classList.remove('auto');
                manualSec.style.display = 'block';
                autoSec.style.display = 'none';
            } else {
                // 切换到自动模式
                bg.classList.add('auto');
                manualSec.style.display = 'none';
                autoSec.style.display = 'block';
            }
        }

        let toastTimeout = null;
        function showToast(message, isError = false) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = isError ? 'show error' : 'show success';
            
            if (toastTimeout) clearTimeout(toastTimeout);
            toastTimeout = setTimeout(() => {
                toast.className = toast.className.replace(/show\s?(error|success)?/, '');
            }, 3500);
        }

        function copyPlainText() {
            const textArea = document.getElementById('plain_text_area');
            textArea.select();
            document.execCommand('copy');
            showToast('✅ 提示词已复制到剪贴板！');
        }

        // 定时轮询后端查看是否有后台任务完成
        let currentQueueSize = 0;
        let isProcessing = false;
        
        function pollResults() {
            fetch('/api/poll_results')
                .then(res => res.json())
                .then(resData => {
                    currentQueueSize = resData.queue_size;
                    isProcessing = !!resData.current_processing;
                    
                    // 更新右上角悬浮窗的队列数量和列表
                    const queueElem = document.getElementById('queue-status');
                    const listElem = document.getElementById('queue-list');
                    
                    const processingCount = resData.current_processing ? 1 : 0;
                    const totalTasks = resData.queue_size + processingCount;
                    
                    if (totalTasks > 0) {
                        document.getElementById('queue-header').textContent = '📊 任务总数: ' + totalTasks + (resData.queue_size > 0 ? ' (排队中: ' + resData.queue_size + ')' : '');
                        queueElem.classList.add('active');
                        listElem.style.display = 'block';
                    } else {
                        document.getElementById('queue-header').textContent = '📊 队列等待数: 0';
                        queueElem.classList.remove('active');
                        listElem.style.display = 'none';
                    }
                    
                    listElem.innerHTML = '';
                    
                    // 显示正在处理的任务
                    if (resData.current_processing) {
                        const li = document.createElement('li');
                        li.style.color = '#27ae60';
                        li.style.fontWeight = 'bold';
                        li.style.fontSize = '13px';
                        li.textContent = '⚡ 处理中: ' + resData.current_processing;
                        li.title = resData.current_processing;
                        listElem.appendChild(li);
                    }
                    
                    // 显示还没开始排队等待的任务
                    resData.queued_titles.forEach(t => {
                        const li = document.createElement('li');
                        li.textContent = '⏳ 排队中: ' + t;
                        li.title = t; // hover 能看到全名
                        listElem.appendChild(li);
                    });
                    
                    // 弹出气泡通知
                    resData.results.forEach(result => {
                        const icon = result.isError ? '❌ ' : '✅ ';
                        showToast(icon + result.message, result.isError);
                    });
                })
                .catch(err => console.error("Poll Error:", err));
        }
        
        // 每 2 秒拉取一次后台结果
        setInterval(pollResults, 2000);

        async function evaluatePaper() {
            const btn = document.getElementById('evalBtn');
            const evalContainer = document.getElementById('eval_result_container');
            const evalResult = document.getElementById('eval_result');

            btn.textContent = '⏳ 正在评估...';
            btn.disabled = true;

            const paperData = {
                title: document.getElementById('title').textContent,
                update_date: document.getElementById('update_date').textContent,
                categories: document.getElementById('categories').textContent,
                abstract: document.getElementById('abstract').textContent
            };

            try {
                const response = await fetch('/api/evaluate_paper', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(paperData)
                });
                const resData = await response.json();

                evalContainer.style.display = 'block';
                if (resData.suitable) {
                    evalContainer.style.borderLeftColor = '#27ae60';
                    evalContainer.style.backgroundColor = '#eafaf1';
                    evalResult.innerHTML = `<strong>✅ 适合作为灵感源</strong><br><strong>原因:</strong> ${resData.reason}`;
                } else {
                    evalContainer.style.borderLeftColor = '#e74c3c';
                    evalContainer.style.backgroundColor = '#fdedec';
                    evalResult.innerHTML = `<strong>❌ 不推荐使用</strong><br><strong>原因:</strong> ${resData.reason}`;
                }
            } catch (err) {
                showToast('❌ 评估异常：' + err, true);
            } finally {
                btn.textContent = '🔍 自动评估适用性';
                btn.disabled = false;
            }
        }

        let autoStopFlag = false;

        function stopAutoMode() {
            autoStopFlag = true;
            const consoleEl = document.getElementById('autoConsole');
            consoleEl.innerHTML += `<br>[${new Date().toLocaleTimeString('en-US', {hour12: false})}] <span style="color:#e74c3c;">🛑 正在停止自动任务，等待当前操作结束后终止...</span><br>`;
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }

        async function startAutoMode() {
            // 参数读取与保护
            const targetCount = parseInt(document.getElementById('autoTargetCount').value) || 50;
            const maxMultiplier = parseFloat(document.getElementById('autoMaxMultiplier').value) || 2;
            const maxRetries = parseInt(document.getElementById('autoMaxRetries').value) || 3;
            const maxAttempts = Math.ceil(targetCount * maxMultiplier);
            
            if (targetCount <= 0 || maxMultiplier < 1) {
                alert('请填写合理的生成目标的数量与倍率阈值');
                return;
            }
            
            if (currentQueueSize > 0 || isProcessing) {
                alert('请等待当前后台队列中的残留任务彻底结束，再启动全新自动流水线');
                return;
            }

            isAutoRunning = true;
            autoStopFlag = false;
            
            // 切换按钮状态
            document.getElementById('autoStartBtn').style.display = 'none';
            document.getElementById('autoStopBtn').style.display = 'inline-block';
            
            // 初始化计量器
            let generatedCount = 0;
            let totalAttempts = 0;
            let discardCount = 0;
            
            document.getElementById('autoTargetText').textContent = targetCount;
            document.getElementById('autoProgressText').textContent = generatedCount;
            document.getElementById('autoAttemptsText').textContent = totalAttempts;
            document.getElementById('autoDiscardText').textContent = discardCount;
            document.getElementById('autoFilterRate').textContent = '0%';
            document.getElementById('autoProgressBar').style.width = '0%';
            
            const consoleEl = document.getElementById('autoConsole');
            consoleEl.innerHTML = `> 🚀 自动生成流水线启动！目标: ${targetCount} 组 (最长允许摸排 ${maxAttempts} 篇)<br>`;
            
            const log = (msg) => {
                const time = new Date().toLocaleTimeString('en-US', {hour12: false});
                consoleEl.innerHTML += `[${time}] ${msg}<br>`;
                consoleEl.scrollTop = consoleEl.scrollHeight;
            };

            let retryCount = 0;
            
            // 核心循环
            while (!autoStopFlag && generatedCount < targetCount && totalAttempts < maxAttempts) {
                try {
                    log(`🎲 正在抽取随机论文...`);
                    const fetchRes = await fetch('/api/random');
                    if (!fetchRes.ok) throw new Error(`抽样请求失败 (HTTP ${fetchRes.status})`);
                    const paperData = await fetchRes.json();
                    
                    if (autoStopFlag) break;
                    
                    totalAttempts++;
                    const shortTitle = paperData.title.length > 30 ? paperData.title.substring(0, 30) + '...' : paperData.title;
                    log(`🤖 正在评估适用性: 《${shortTitle}》`);
                    
                    const evalRes = await fetch('/api/evaluate_paper', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(paperData)
                    });
                    if (!evalRes.ok) throw new Error(`评估请求失败 (HTTP ${evalRes.status})`);
                    const evalData = await evalRes.json();
                    
                    if (autoStopFlag) break;
                    
                    // 重置报错计数
                    retryCount = 0;

                    if (evalData.suitable) {
                        log(`✅ 适用性评估通过！投递到大语言模型进行 Query 生成...`);
                        const plainText = `${PROMPT_PREFIX}标题：${paperData.title}\n日期：${paperData.update_date}\n作者：${paperData.authors}\n摘要：${paperData.abstract}`;
                        
                        const genRes = await fetch('/api/generate_and_save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ prompt: plainText, title: paperData.title })
                        });
                        if (!genRes.ok) throw new Error(`提交生成任务失败 (HTTP ${genRes.status})`);
                        
                        // 串行执行逻辑：每投递一篇，必须耐心等待其从后台队列完全消化掉才继续
                        log(`⏳ 任务已入队，[串行安全模式] 正等待大模型生成并写入CSV...`);
                        let hasStartedProcessing = false;
                        while (!autoStopFlag) {
                            await new Promise(r => setTimeout(r, 1500)); // 给心跳时间
                            if (currentQueueSize > 0 || isProcessing) {
                                hasStartedProcessing = true;
                            } else if (hasStartedProcessing && currentQueueSize === 0 && !isProcessing) {
                                // 已经开始过且目前队列和执行都清空，说明执行完毕
                                break;
                            } else if (currentQueueSize === 0 && !isProcessing) {
                                // 可能刚好 pollInterval 没拉到最新状态或者后台瞬间执行完毕（概率极小）
                                // 容错重试多等一秒判断
                                await new Promise(r => setTimeout(r, 1000));
                                if (currentQueueSize === 0 && !isProcessing) break;
                            }
                        }
                        
                        if (autoStopFlag) break;
                        
                        generatedCount++;
                        log(`✨ <span style="color:#f39c12;">当前论文生成并落库完毕！当前进度: ${generatedCount} / ${targetCount}</span>`);
                        
                    } else {
                        discardCount++;
                        log(`❌ 论文不适用，已丢弃。(原因: <span style="color:#e74c3c;">${evalData.reason}</span>)`);
                    }
                    
                    // 刷新状态盘数据
                    document.getElementById('autoProgressText').textContent = generatedCount;
                    document.getElementById('autoAttemptsText').textContent = totalAttempts;
                    document.getElementById('autoDiscardText').textContent = discardCount;
                    document.getElementById('autoFilterRate').textContent = Math.round((discardCount / totalAttempts) * 100) + '%';
                    document.getElementById('autoProgressBar').style.width = Math.round((generatedCount / targetCount) * 100) + '%';
                    
                } catch (err) {
                    retryCount++;
                    log(`<span style="color:#e74c3c;">⚠️ 发生意外错误: ${err.message} (第 ${retryCount}/${maxRetries} 次重试)</span>`);
                    if (retryCount > maxRetries) {
                        log(`<span style="color:#e74c3c;">🚨 连续网络崩溃或大对象拦截超限，流水线强行熔断！</span>`);
                        break;
                    }
                    await new Promise(r => setTimeout(r, 2000));
                }
            } // end while
            
            // 结算语
            if (generatedCount >= targetCount) {
                log(`🎉 <strong style="color:white; background:#27ae60; padding:2px 5px;">达成目标容量！成功生产并通过筛选 ${targetCount} 组问答指令。</strong>`);
            } else if (totalAttempts >= maxAttempts) {
                log(`🛑 达到尝试倍率极值上限 (${maxAttempts}抽样)，可能当前科研方向可选取样本过少，已自动停机。`);
            } else {
                log(`🛑 流水线已人工停止或熔断退出，最终生产 ${generatedCount} 条结果。`);
            }
            
            // 状态还原
            document.getElementById('autoStartBtn').style.display = 'inline-block';
            document.getElementById('autoStopBtn').style.display = 'none';
            isAutoRunning = false;
        }

        async function autoGenerateAndSave() {
            const promptStr = document.getElementById('plain_text_area').value;
            const paperTitle = document.getElementById('title').textContent || '未知论文';
            
            if (!promptStr) {
                showToast('❌ 提示词为空，无法生成', true);
                return;
            }
            
            const btn = document.getElementById('autoGenTopBtn');
            const originalText = '💻 自动生成并存入CSV';
            btn.textContent = '⏳ 请求已加入队列...';
            btn.disabled = true;
            btn.style.backgroundColor = '#95a5a6';
            
            try {
                const response = await fetch('/api/generate_and_save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: promptStr, title: paperTitle })
                });
                
                const resData = await response.json();
                
                if (response.ok) {
                    showToast('✅ ' + resData.message);
                } else {
                    let errMsg = '❌ 添加队列失败：' + (resData.error || '未知错误');
                    showToast(errMsg, true);
                }
            } catch (err) {
                showToast('❌ 请求异常：' + err, true);
            } finally {
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.disabled = false;
                    btn.style.backgroundColor = '#27ae60';
                }, 800); // .8秒后恢复按钮，方便立即继续处理下一个
            }
        }

        const PROMPT_PREFIX = `请根据我提供的文章元数据（如标题、摘要、关键词、研究问题、方法、数据集等），**生成三个**适合作为**论文检索查询**的**中文**问题。

**核心要求：**  
- 这些问题用于**找到相似主题、方法、数据集或领域的其他文章**，而不是对当前文章内容提出一个可被直接回答的事实性问题（例如“本文的准确率是多少？”或“作者提出了什么模型？”）。  
- 问题应像用户向 AI 学术助手或 Agentic RAG 系统提问时使用的自然语言查询。  
- 问题应具备一定通用性，能够召回一批同主题、同任务或同技术路线的论文；避免使用本文特有的专有名词（如自创方法名、特定实验代号等），除非该名词已广泛代表一个研究类别，要避免检索范围过窄（如限制条件太多太具体）。  
- **生成候选问题时，可以灵活考虑是否加入时间限制（如“近三年”、“2024年以来”等），尤其对于新兴且高速迭代的领域。时间限制不作为评选优劣的依据，即带时间限制的问题与不带时间限制的问题在最终选择时具有同等竞争资格，选择最优问题完全基于其通用性、代表性以及评测检索系统的适合度。**  
- 示例（好的检索问题）：  
  - “哪些论文使用了 HotpotQA 数据集？”（数据集通用）  
  - “有哪些脑电大模型相关的工作？”（领域通用）  
  - “泡泡玛特产品的研究策略有哪些？”（主题通用）  
  - “最新的信息检索（IR）领域论文有哪些？”（可接受）  
- 反例（不合适的检索问题，因为过于具体或偏向答案）：  
  - “如何利用部分配对的多模态数据识别仅由单一模态采样的神经元类型？”（过于具体）  
  - “本文得出的结论是什么？”（答案型问题）  
  - “哪些论文使用了本文提出的 Q-flip 协议？”（特有名词，无法召回其他论文）

**输出格式：** 请直接输出这三个问题，你可以使用无序列表或逐行输出，但不要添加额外解释：
\n\n`;

        let isFirstLoad = true;

        async function fetchRandomRecord() {
            const loading = document.getElementById('loading');
            const resultDiv = document.getElementById('result');
            const initialLoader = document.getElementById('initial-loader');
            
            if (!isFirstLoad) {
                loading.style.display = 'block';
            }
            
            try {
                const response = await fetch('/api/random');
                const data = await response.json();
                
                document.getElementById('title').textContent = data.title;
                document.getElementById('id').textContent = data.id;
                document.getElementById('categories').textContent = data.categories;
                document.getElementById('update_date').textContent = data.update_date;
                document.getElementById('authors').textContent = data.authors;
                document.getElementById('abstract').textContent = data.abstract;
                
                // 设置纯文本形态的内容 (包含 Prompt 前缀)
                const plainText = `${PROMPT_PREFIX}标题：${data.title}\n日期：${data.update_date}\n作者：${data.authors}\n摘要：${data.abstract}`;
                document.getElementById('plain_text_area').value = plainText;

                // 处理发表信息 (Journal-ref 和 DOI)
                const publishContainer = document.getElementById('publish_info_container');
                const publishInfo = document.getElementById('publish_info');
                let infoParts = [];
                if (data['journal-ref']) infoParts.push(`📰 ${data['journal-ref']}`);
                if (data['doi']) infoParts.push(`🔗 DOI: ${data['doi']}`);
                
                if (infoParts.length > 0) {
                    publishInfo.textContent = infoParts.join(" | ");
                    publishContainer.style.display = 'block';
                } else {
                    publishContainer.style.display = 'none';
                }

                // 处理版本记录显示
                let versionsText = "";
                if (data.versions && Array.isArray(data.versions)) {
                    versionsText = data.versions.map(v => `${v.version}: ${v.created}`).join(" | ");
                }
                document.getElementById('versions').textContent = versionsText;
                
                resultDiv.style.display = 'block';
                document.getElementById('eval_result_container').style.display = 'none';
                document.getElementById('eval_result').innerHTML = '';
                
                if (isFirstLoad) {
                    showToast('✅ 数据集加载成功，现在可以开始光速挑选了！');
                }
            } catch (error) {
                alert('数据获取或解析失败，请检查后端运行状态。');
            } finally {
                loading.style.display = 'none';
                if (isFirstLoad) {
                    initialLoader.style.display = 'none';
                    isFirstLoad = false;
                }
            }
        }
        
        // 页面加载时自动获取一次
        window.onload = fetchRandomRecord;