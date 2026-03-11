const app = {
    questions: [],
    answers: {},
    doubts: {}, 
    history: [], // 🌟 新增：存放历次测试的“时光机”数组
    currentIndex: 0,
    slideDirection: '',
    domainMap: { 'N':'神经质', 'E':'外向性', 'O':'开放性', 'A':'宜人性', 'C':'尽责性' },
    
    gistConfig: {
        id: localStorage.getItem('gist_id') || '',
        token: localStorage.getItem('gist_token') || ''
    },

    updateTime: 0,          
    syncCooldown: 15000,    
    lastApiCallTime: 0,     
    needsSync: false,       
    syncTimer: null,        

    async init() {
        const urlParams = new URLSearchParams(window.location.search);
        const keyFromUrl = urlParams.get('key');
        const CORRECT_KEY = '11115555';

        if (keyFromUrl === CORRECT_KEY) localStorage.setItem('access_key', keyFromUrl);

        if (localStorage.getItem('access_key') !== CORRECT_KEY) {
            document.body.innerHTML = `
                <div style="text-align:center; margin-top:100px; font-family:sans-serif; padding: 20px;">
                    <h2>🔒 受保护的内容</h2>
                    <p style="color:#666; margin-bottom:20px;">请输入暗号进入测试：</p>
                    <input type="password" id="pwd" style="padding:12px; width:80%; max-width:200px; border-radius:5px; border:1px solid #ccc; font-size:16px;">
                    <br><br>
                    <button onclick="const k=document.getElementById('pwd').value; if(k==='${CORRECT_KEY}'){localStorage.setItem('access_key',k); location.reload();}else{alert('密码错误');}" style="padding:12px 30px; cursor:pointer; background:#2196f3; color:#fff; border:none; border-radius:5px; font-size:16px;">进入</button>
                </div>`;
            return;
        }

        this.initSwipeGesture();

        try {
            const timestamp = new Date().getTime();
            const response = await fetch(`data/questions.json?t=${timestamp}`);
            if(!response.ok) throw new Error("无法读取题库文件");
            this.questions = await response.json();
            
            this.loadLocalData();
            if (this.gistConfig.id && this.gistConfig.token) {
                await this.loadFromGist();
            }
            
            this.currentIndex = this.questions.findIndex(q => !this.answers[q.Number] && this.answers[q.Number] !== 'skip');
            if(this.currentIndex === -1) this.currentIndex = this.questions.length - 1;

            this.initProgressBar();
            this.renderQuestion();
        } catch (error) {
            console.error("初始化错误：", error);
            document.getElementById('question-card').innerHTML = `<div style="color:red; text-align:center; padding: 30px;">❌ 数据加载失败</div>`;
        }
    },

    // --- 数据持久化层（加入了 history） ---
    loadLocalData() {
        const localData = JSON.parse(localStorage.getItem('ipip_answers')) || {};
        if (localData.answers !== undefined) {
            this.answers = localData.answers;
            this.doubts = localData.doubts || {};
            this.history = localData.history || []; // 读取历史记录
            this.updateTime = localData.update_time || 0; 
        } else {
            this.answers = localData; 
            this.doubts = {};
            this.history = [];
            this.updateTime = 0;
        }
    },
    
    saveLocalData() {
        this.updateTime = Date.now(); 
        localStorage.setItem('ipip_answers', JSON.stringify({ 
            answers: this.answers, 
            doubts: this.doubts,
            history: this.history, // 保存历史记录
            update_time: this.updateTime 
        }));
    },

    // --- 同步引擎 ---
    triggerCloudSave() { this.needsSync = true; this.attemptSync(); },

    attemptSync() {
        if (!this.needsSync) return;
        const now = Date.now();
        const timeSinceLastCall = now - this.lastApiCallTime;
        const statusEl = document.getElementById('sync-status');

        if (timeSinceLastCall >= this.syncCooldown) {
            this.lastApiCallTime = now;
            this.needsSync = false;
            this.saveToGist();
        } else {
            if(statusEl) statusEl.innerHTML = `<span style='color:#888;'>💾 本地秒存 (冷却中)</span>`;
            if (!this.syncTimer) {
                this.syncTimer = setTimeout(() => {
                    this.syncTimer = null;
                    this.attemptSync();
                }, this.syncCooldown - timeSinceLastCall);
            }
        }
    },

    forceCloudSync() {
        if (this.syncTimer) clearTimeout(this.syncTimer);
        this.syncTimer = null;
        this.lastApiCallTime = 0; 
        this.needsSync = true;
        this.attemptSync();
    },

    async fetchWithTimeout(url, options, timeout = 10000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            throw error;
        }
    },

    async loadFromGist() {
        const statusEl = document.getElementById('sync-status');
        if(statusEl) { statusEl.innerHTML = "<span style='color:#f57c00;'>⏳ 检查云端更新...</span>"; statusEl.onclick = null; }
        
        try {
            const cleanId = this.gistConfig.id.trim();
            const cleanToken = this.gistConfig.token.trim();
            const url = `https://api.github.com/gists/${cleanId}?t=${new Date().getTime()}`;
            
            const res = await this.fetchWithTimeout(url, { headers: { 'Authorization': `Bearer ${cleanToken}` } }, 10000);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const data = await res.json();
            if (!data.files || !data.files['ipip_answers.json']) throw new Error("云端无对应文件");

            let content;
            try { content = JSON.parse(data.files['ipip_answers.json'].content); } catch (e) { throw new Error("云端数据结构损坏"); }
            
            if (content && typeof content === 'object') {
                const cloudAnswers = content.answers !== undefined ? content.answers : content;
                const cloudDoubts = content.doubts || content["疑问"] || {};
                const cloudHistory = content.history || []; // 提取云端历史
                const cloudUpdateTime = content.update_time || 0;

                if (cloudUpdateTime > this.updateTime) {
                    this.answers = cloudAnswers;
                    this.doubts = cloudDoubts;
                    this.history = cloudHistory; // 覆盖历史
                    this.updateTime = cloudUpdateTime;
                    localStorage.setItem('ipip_answers', JSON.stringify({ answers: this.answers, doubts: this.doubts, history: this.history, update_time: this.updateTime })); 
                    
                    if(statusEl) statusEl.innerHTML = "<span style='color:#4caf50;'>✅ 已拉取云端进度</span>";
                    if(document.getElementById('question-card').innerHTML !== '') { this.updateProgress(); this.renderQuestion(); }
                } else if (this.updateTime > cloudUpdateTime) {
                    if(statusEl) statusEl.innerHTML = "<span style='color:#2196f3;'>🚀 本地超前，推送中...</span>";
                    this.forceCloudSync();
                } else {
                    if(statusEl) statusEl.innerHTML = "<span style='color:#4caf50;'>✅ 保持同步</span>";
                }
            }
        } catch (e) {
            console.error("【同步拉取异常】", e);
            if(statusEl) {
                statusEl.innerHTML = "<span style='color:#d32f2f; cursor:pointer;'>❌ 同步失败(点我)</span>";
                statusEl.onclick = () => alert(`🚨 拉取失败: ${e.message}`);
            }
        }
    },

    async saveToGist() {
        if (!this.gistConfig.id || !this.gistConfig.token) return;
        const statusEl = document.getElementById('sync-status');
        if(statusEl) { statusEl.innerHTML = "<span style='color:#f57c00;'>⏳ 正在上云...</span>"; statusEl.onclick = null; }
        
        try {
            // 打包所有数据，包含 history
            const payload = { answers: this.answers, doubts: this.doubts, history: this.history, update_time: this.updateTime };
            const cleanId = this.gistConfig.id.trim();
            const cleanToken = this.gistConfig.token.trim();
            
            const res = await this.fetchWithTimeout(`https://api.github.com/gists/${cleanId}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${cleanToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: { 'ipip_answers.json': { content: JSON.stringify(payload) } } })
            }, 10000);
            
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            if(statusEl) statusEl.innerHTML = "<span style='color:#4caf50;'>✅ 已安全上云</span>";
            
        } catch (e) { 
            console.error("【同步保存异常】", e);
            if(statusEl) {
                statusEl.innerHTML = "<span style='color:#d32f2f; cursor:pointer;'>❌ 上传失败(点我)</span>";
                statusEl.onclick = () => alert(`🚨 保存失败: ${e.message}\n已存在本地缓存中。`);
            }
        }
    },

    // --- 🌟 新增功能 1：归档并重测 ---
    archiveAndRestart() {
        const answeredCount = Object.keys(this.answers).length;
        if (answeredCount === 0) return alert("当前没有可保存的进度！");
        
        const confirmMsg = `确定要将当前进度（已答 ${answeredCount} 题）封存到历史记录中，并重新开始全新的测试吗？\n\n（封存后，您可以在上方“历史”按钮中随时导出这份旧数据，但当前屏幕将被清空。）`;
        if (!confirm(confirmMsg)) return;

        // 生成时间戳格式的日期名称
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

        // 把当前内容塞进历史阵列
        this.history.unshift({
            id: now.getTime(),
            date: dateStr,
            answers: JSON.parse(JSON.stringify(this.answers)), // 深拷贝
            doubts: JSON.parse(JSON.stringify(this.doubts))
        });

        // 彻底清空当前主进度
        this.answers = {};
        this.doubts = {};
        this.currentIndex = 0;
        
        this.saveLocalData();
        this.forceCloudSync(); // 强制云端同步这次大变更
        alert("✅ 已成功封存！即将为您加载全新空白测试...");
        location.reload(); 
    },

    // --- 🌟 新增功能 2：历史记录弹窗 ---
    showHistoryModal() {
        let oldModal = document.getElementById('history-modal');
        if (oldModal) oldModal.remove();

        let listHtml = this.history.length === 0 ? '<div style="text-align:center; padding: 30px; color:#888;">暂无历史归档记录</div>' : '';
        
        this.history.forEach((h, index) => {
            const ansCount = Object.keys(h.answers).length;
            listHtml += `
            <div style="border:1px solid #e0e0e0; padding:15px; border-radius:10px; margin-bottom:12px; background:#fafafa; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:bold; color:#333; font-size: 15px;">档案 ${this.history.length - index}</div>
                    <div style="font-size:12px; color:#888; margin-top:6px;">🕒 ${h.date} | 已答 ${ansCount} 题</div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button onclick="app.exportExcel(${index})" style="padding:6px 12px; border:none; background:#4caf50; color:#fff; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold;">📊 下载报告</button>
                    <button onclick="app.deleteHistory(${index})" style="padding:6px 12px; border:none; background:#ef5350; color:#fff; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold;">删除</button>
                </div>
            </div>`;
        });

        const modalHtml = `
        <div id="history-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; display:flex; justify-content:center; align-items:center;">
            <div style="background:#fff; padding:25px; border-radius:16px; width:90%; max-width:450px; max-height:80vh; display:flex; flex-direction:column; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
                    <h3 style="margin:0; font-size:20px; color:#111;">📜 历史归档记录</h3>
                    <button onclick="document.getElementById('history-modal').remove()" style="background:none; border:none; font-size:24px; color:#888; cursor:pointer;">&times;</button>
                </div>
                <div style="overflow-y:auto; flex:1; padding-right:5px;">
                    ${listHtml}
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    deleteHistory(index) {
        if (!confirm("警告：删除后无法恢复，确定要删除这条历史记录吗？")) return;
        this.history.splice(index, 1);
        this.saveLocalData();
        this.forceCloudSync();
        this.showHistoryModal(); // 刷新弹窗
    },

    // --- 🌟 核心升级：大厂级 Excel 纯前端生成器 ---
    exportExcel(historyIndex = null) {
        if (typeof XLSX === 'undefined') {
            alert("Excel 引擎仍在加载，请等待几秒钟后再点！");
            return;
        }

        // 判断是导出当前进度，还是导出历史记录
        const targetAnswers = historyIndex !== null ? this.history[historyIndex].answers : this.answers;
        const targetDoubts = historyIndex !== null ? this.history[historyIndex].doubts : this.doubts;
        const targetDate = historyIndex !== null ? this.history[historyIndex].date.replace(/[: ]/g, "_") : "当前最新";

        if (Object.keys(targetAnswers).length === 0) return alert("该记录中没有答题数据！");

        // 计算所有得分数据
        const { itemResults, domainStats, facetStats } = this.calculateScoresData(targetAnswers, targetDoubts);
        
        // 创建空的工作簿
        const wb = XLSX.utils.book_new();

        // Sheet 1: 五大维度
        const ws1_data = [["维度代码", "维度名称", "总分"]];
        for(let d in domainStats) { ws1_data.push([d, this.domainMap[d], domainStats[d].sum]); }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ws1_data), "01_五大维度总分");

        // Sheet 2: 三十个子面
        const ws2_data = [["子面代码", "总分"]];
        const sortedFacets = Object.keys(facetStats).sort();
        sortedFacets.forEach(f => { ws2_data.push([f, facetStats[f].sum]); });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ws2_data), "02_三十个子面得分");

        // Sheet 3: 疑问汇总
        const ws3_data = [["题号", "分面", "原始分", "疑问备注", "题目内容"]];
        itemResults.filter(r => r.Doubt).forEach(r => {
            ws3_data.push([r.Number, r.Facet, r.Raw, r.Doubt, r.Item]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ws3_data), "03_受测者疑问汇总");

        // Sheet 4: 原始数据
        const ws4_data = [["题号", "分面", "方向", "原始分", "计分", "疑问备注", "题目内容"]];
        itemResults.forEach(r => {
            ws4_data.push([r.Number, r.Facet, r.Sign, r.Raw, r.Scored, r.Doubt, r.Item]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ws4_data), "04_原始答卷与计分");

        // 触发下载
        XLSX.writeFile(wb, `IPIP_NEO_专业分析报告_${targetDate}.xlsx`);
    },

    // 内部剥离的计算引擎，支持对任意对象（当前/历史）进行计分
    calculateScoresData(ansObj, doubtObj) {
        const itemResults = [];
        const domainStats = { N: {sum:0, count:0}, E: {sum:0, count:0}, O: {sum:0, count:0}, A: {sum:0, count:0}, C: {sum:0, count:0} };
        const facetStats = {};

        this.questions.forEach(q => {
            let ans = ansObj[q.Number];
            if (ans && ans !== 'skip') {
                let scored = q.Sign === "_" ? 6 - ans : ans;
                
                // 大维度统计
                domainStats[q.Facet.charAt(0)].sum += scored;
                domainStats[q.Facet.charAt(0)].count += 1;
                
                // 子面统计 (如 N1, N2)
                if (!facetStats[q.Facet]) facetStats[q.Facet] = { sum: 0, count: 0 };
                facetStats[q.Facet].sum += scored;
                facetStats[q.Facet].count += 1;

                const doubt = doubtObj[q.Number] || '';
                itemResults.push({ Number: q.Number, Facet: q.Facet, Sign: q.Sign, Raw: ans, Scored: scored, Doubt: doubt, Item: q.Item });
            }
        });
        return { itemResults, domainStats, facetStats };
    },

    // 供结果页展示用的简易计算器
    calculateScores() { return this.calculateScoresData(this.answers, this.doubts); },
    showResults() {
        document.getElementById('quiz-screen').style.display = 'none';
        document.getElementById('result-screen').style.display = 'block';
        const { domainStats } = this.calculateScores();
        let html = "";
        for (let d in domainStats) {
            if(domainStats[d].count > 0) html += `<tr><td><strong>${this.domainMap[d]}</strong></td><td>${domainStats[d].count}</td><td>${domainStats[d].sum}</td></tr>`;
        }
        document.querySelector('#domain-table tbody').innerHTML = html;
        this.forceCloudSync(); 
    },

    // --- 交互及杂项代码维持原样 ---
    initSwipeGesture() {
        let touchstartX = 0; let touchstartY = 0;
        const threshold = 40; 
        document.addEventListener('touchstart', e => { touchstartX = e.changedTouches[0].screenX; touchstartY = e.changedTouches[0].screenY; }, {passive: true});
        document.addEventListener('touchend', e => {
            const touchendX = e.changedTouches[0].screenX;
            const touchendY = e.changedTouches[0].screenY;
            if (Math.abs(touchendX - touchstartX) > Math.abs(touchendY - touchstartY)) {
                if (touchstartX - touchendX > threshold) {
                    const ans = this.answers[this.questions[this.currentIndex].Number];
                    if (ans && ans !== 'skip') this.goNext(); else this.skipQuestion();
                }
                if (touchendX - touchstartX > threshold) this.goPrev();
            }
        }, {passive: true});
    },
    setupGist() {
        let oldModal = document.getElementById('gist-modal');
        if (oldModal) oldModal.remove();
        const modalHtml = `
        <div id="gist-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; display:flex; justify-content:center; align-items:center;">
            <div style="background:#fff; padding:25px; border-radius:16px; width:85%; max-width:400px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                <h3 style="margin-top:0; font-size:20px; color:#111;">☁️ 配置云同步</h3>
                <p style="font-size:14px; color:#666; margin-bottom: 15px;">请输入配置以打通云端数据库：</p>
                <input type="text" id="g-id" placeholder="Gist ID" value="${this.gistConfig.id}" style="width:100%; padding:12px; margin-bottom:15px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box; font-size:14px;">
                <input type="text" id="g-token" placeholder="GitHub Token (ghp_...)" value="${this.gistConfig.token}" style="width:100%; padding:12px; margin-bottom:20px; border:1px solid #ccc; border-radius:8px; box-sizing:border-box; font-size:14px;">
                <div style="display:flex; justify-content:flex-end; gap:12px;">
                    <button onclick="document.getElementById('gist-modal').remove()" style="padding:10px 18px; border:none; background:#f0f0f0; border-radius:8px; cursor:pointer; font-size:14px; color:#555;">取消</button>
                    <button onclick="const id=document.getElementById('g-id').value.trim(); const tk=document.getElementById('g-token').value.trim(); if(id&&tk){localStorage.setItem('gist_id',id); localStorage.setItem('gist_token',tk); location.reload();}else{alert('不能为空');}" style="padding:10px 18px; border:none; background:#2196f3; color:#fff; border-radius:8px; cursor:pointer; font-size:14px; font-weight:bold;">保存并刷新</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },
    initProgressBar() {
        let html = '';
        for(let i = 0; i < this.questions.length; i++) html += `<div class="prog-seg" id="seg-${this.questions[i].Number}"></div>`;
        document.getElementById('progress-bar').innerHTML = html;
    },
    renderQuestion() {
        if (!this.questions || this.questions.length === 0) return;
        if (this.currentIndex >= this.questions.length) return this.showResults();
        const q = this.questions[this.currentIndex];
        if (!q || !q.Item) return;

        const currentAnswer = this.answers[q.Number];
        const labels = { 1: "非常不同意", 2: "不同意", 3: "一般/不确定", 4: "同意", 5: "非常同意" };

        const rawAnchor = (q.Anchor || '').replace(/\\n/g, '\n').replace(/•/g, '\n•'); 
        const parsedAnchor = rawAnchor.split('\n').map(line => {
            line = line.trim();
            if(!line) return '';
            if(line.startsWith('•')) {
                return `<div style="display: flex; align-items: flex-start; margin-bottom: 12px;">
                            <span style="color: #8c9eff; margin-right: 12px; font-weight: bold; font-size: 18px; line-height: 1.6;">•</span>
                            <span style="flex: 1; line-height: 1.6; color: #333333; text-align: justify;">${line.substring(1).trim()}</span>
                        </div>`;
            }
            return `<div style="margin-bottom: 8px; line-height: 1.6; color: #555;">${line}</div>`;
        }).join('');

        const hasDoubt = this.doubts[q.Number] !== undefined;
        const doubtText = hasDoubt ? this.doubts[q.Number] : '';

        let html = `
            <div class="q-number">题目 ${this.currentIndex + 1} / ${this.questions.length}</div>
            <div class="q-title">${q.Item}</div>
            <div class="q-anchor">${parsedAnchor}</div>
            <div class="options-area">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
                    <button class="doubt-toggle ${hasDoubt ? 'active' : ''}" onclick="app.toggleDoubt(${q.Number})">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        ${hasDoubt ? '取消疑问' : '添加疑问'}
                    </button>
                    ${hasDoubt ? `<input type="text" id="doubt-input-${q.Number}" class="apple-input" placeholder="具体是哪里有疑问？" value="${doubtText}" onblur="app.saveDoubt(${q.Number}, this.value)" style="flex: 1;">` : ''}
                </div>
                <div class="row-int">
                    ${[1, 2, 3, 4, 5].map(v => `<div class="opt-btn ${currentAnswer === v ? 'selected' : ''}" onclick="app.selectOption(${q.Number}, ${v}, this)">${v} <span class="label">${labels[v]}</span></div>`).join('')}
                </div>
                <div class="row-half">
                    ${[1.5, 2.5, 3.5, 4.5].map(v => `<div class="opt-btn ${currentAnswer === v ? 'selected' : ''}" onclick="app.selectOption(${q.Number}, ${v}, this)" style="padding: 12px 0;">${v}</div>`).join('')}
                </div>
            </div>`;
        
        const card = document.getElementById('question-card');
        card.innerHTML = html;
        card.classList.remove('slide-in-right', 'slide-in-left', 'fade-in');
        void card.offsetWidth; 
        if (this.slideDirection === 'left') card.classList.add('slide-in-right'); 
        else if (this.slideDirection === 'right') card.classList.add('slide-in-left'); 
        else card.classList.add('fade-in'); 
        this.slideDirection = ''; 

        document.getElementById('prev-btn').style.visibility = (this.currentIndex === 0) ? 'hidden' : 'visible';
        if (currentAnswer && currentAnswer !== 'skip') {
            document.getElementById('next-btn').style.display = 'block';
            document.getElementById('skip-btn').style.display = 'none';
        } else {
            document.getElementById('next-btn').style.display = (currentAnswer === 'skip') ? 'block' : 'none';
            document.getElementById('skip-btn').style.display = 'block';
        }
        this.updateProgress();
    },
    toggleDoubt(qNumber) {
        if (this.doubts[qNumber] !== undefined) delete this.doubts[qNumber]; else this.doubts[qNumber] = ""; 
        this.saveLocalData(); this.triggerCloudSave(); this.renderQuestion(); 
        if (this.doubts[qNumber] !== undefined) setTimeout(() => document.getElementById(`doubt-input-${qNumber}`).focus(), 50);
    },
    saveDoubt(qNumber, text) {
        if (this.doubts[qNumber] !== undefined) { this.doubts[qNumber] = text.trim(); this.saveLocalData(); this.triggerCloudSave(); }
    },
    selectOption(qNumber, value, element) {
        if (this.answers[qNumber] === value) {
            delete this.answers[qNumber]; element.classList.remove('selected');
            this.saveLocalData(); this.updateProgress(); this.triggerCloudSave(); this.renderQuestion(); return;
        }
        this.answers[qNumber] = value; this.saveLocalData();
        document.querySelectorAll('.opt-btn').forEach(btn => btn.classList.remove('selected'));
        element.classList.add('selected');
        this.updateProgress(); this.triggerCloudSave(); setTimeout(() => this.goNext(), 300);
    },
    skipQuestion() { this.answers[this.questions[this.currentIndex].Number] = 'skip'; this.saveLocalData(); this.triggerCloudSave(); this.goNext(); },
    goPrev() { if(this.currentIndex > 0) { this.currentIndex--; this.slideDirection = 'right'; this.renderQuestion(); } },
    goNext() { this.currentIndex++; this.slideDirection = 'left'; if(this.currentIndex >= this.questions.length) this.showResults(); else this.renderQuestion(); },
    updateProgress() {
        let answeredCount = 0;
        this.questions.forEach(q => {
            const seg = document.getElementById(`seg-${q.Number}`);
            if(!seg) return;
            const ans = this.answers[q.Number];
            seg.className = 'prog-seg'; 
            if (ans === 'skip') seg.classList.add('skip');
            else if (ans !== undefined) { seg.classList.add('done'); answeredCount++; }
        });
        document.getElementById('progress-text').innerText = `已答 ${answeredCount} / ${this.questions.length}`;
    },
    exportSaveCode() {
        try {
            if (Object.keys(this.answers).length === 0) return alert("暂无记录！");
            // 注意：进度码导出时不包含 history，防止二维码过大
            const payload = { answers: this.answers, doubts: this.doubts, update_time: this.updateTime };
            const code = btoa(encodeURIComponent(JSON.stringify(payload)));
            navigator.clipboard.writeText(code).then(() => alert("✅ 进度码已复制！可发送给其他设备。")).catch(() => prompt("请手动复制以下进度码：", code));
        } catch (e) { alert(`❌ 导出失败：${e.message}`); }
    },
    importSaveCode() {
        const code = prompt("粘贴进度码：");
        if (!code) return;
        try {
            const content = JSON.parse(decodeURIComponent(atob(code)));
            if (content.answers !== undefined) {
                this.answers = content.answers; this.doubts = content.doubts || {}; this.updateTime = content.update_time || Date.now();
            } else {
                this.answers = content; this.doubts = {}; this.updateTime = Date.now();
            }
            this.saveLocalData(); this.forceCloudSync(); 
            alert("✅ 导入成功！正在刷新页面..."); location.reload(); 
        } catch (e) { alert("❌ 损坏的进度码，无法识别。"); }
    }
};