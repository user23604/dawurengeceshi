const app = {
    questions: [],
    answers: {},
    doubts: {}, 
    currentIndex: 0,
    slideDirection: '',
    domainMap: { 'N':'神经质', 'E':'外向性', 'O':'开放性', 'A':'宜人性', 'C':'尽责性' },
    
    gistConfig: {
        id: localStorage.getItem('gist_id') || '',
        token: localStorage.getItem('gist_token') || ''
    },

    // 🌟 高级网络引擎核心变量
    updateTime: 0,          // 本地数据的最后修改时间戳
    syncCooldown: 15000,    // 严格节流阀：冷却时间 15 秒 (严防 403 封禁)
    lastApiCallTime: 0,     // 上一次真实发送网络请求的时间
    needsSync: false,       // 脏数据标记：是否有未同步的本地改动
    syncTimer: null,        // 节流定时器

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
            
            // 初始化阶段，先加载本地，再尝试拉云端比对
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

    // --- 数据持久化与时间戳打标 ---
    loadLocalData() {
        const localData = JSON.parse(localStorage.getItem('ipip_answers')) || {};
        if (localData.answers !== undefined) {
            this.answers = localData.answers;
            this.doubts = localData.doubts || {};
            this.updateTime = localData.update_time || 0; // 提取本地时间戳
        } else {
            this.answers = localData; 
            this.doubts = {};
            this.updateTime = 0;
        }
    },
    
    saveLocalData() {
        this.updateTime = Date.now(); // 只要有任何增删改，瞬间打上最新时间戳
        localStorage.setItem('ipip_answers', JSON.stringify({ 
            answers: this.answers, 
            doubts: this.doubts,
            update_time: this.updateTime 
        }));
    },

    // 🌟 核心：真正的状态机节流阀 (Throttling)
    triggerCloudSave() {
        this.needsSync = true;
        this.attemptSync();
    },

    attemptSync() {
        if (!this.needsSync) return; // 如果没有脏数据，直接不管

        const now = Date.now();
        const timeSinceLastCall = now - this.lastApiCallTime;
        const statusEl = document.getElementById('sync-status');

        if (timeSinceLastCall >= this.syncCooldown) {
            // 冷却时间已过，准许发送网络请求
            this.lastApiCallTime = now;
            this.needsSync = false;
            this.saveToGist();
        } else {
            // 还在冷却期内，显示暂存，并安排定时器在冷却结束后自动发送
            if(statusEl) statusEl.innerHTML = `<span style='color:#888;'>💾 本地秒存 (等待冷却...)</span>`;
            if (!this.syncTimer) {
                this.syncTimer = setTimeout(() => {
                    this.syncTimer = null;
                    this.attemptSync();
                }, this.syncCooldown - timeSinceLastCall);
            }
        }
    },

    // 手动强制同步按钮接口
    forceCloudSync() {
        if (this.syncTimer) clearTimeout(this.syncTimer);
        this.syncTimer = null;
        this.lastApiCallTime = 0; // 强制重置冷却锁
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
            if (!res.ok) throw new Error(`HTTP状态码 ${res.status}`);
            
            const data = await res.json();
            if (!data.files || !data.files['ipip_answers.json']) throw new Error("云端无对应文件");

            let content;
            try { content = JSON.parse(data.files['ipip_answers.json'].content); } catch (e) { throw new Error("云端数据结构损坏"); }
            
            if (content && typeof content === 'object') {
                const cloudAnswers = content.answers !== undefined ? content.answers : content;
                const cloudDoubts = content.doubts || content["疑问"] || {};
                const cloudUpdateTime = content.update_time || 0; // 获取云端时间戳

                // 🌟 LWW (Last-Write-Wins) 时间戳冲突仲裁引擎
                if (cloudUpdateTime > this.updateTime) {
                    // 云端时间比本地新：静默覆盖本地数据
                    this.answers = cloudAnswers;
                    this.doubts = cloudDoubts;
                    this.updateTime = cloudUpdateTime;
                    localStorage.setItem('ipip_answers', JSON.stringify({ answers: this.answers, doubts: this.doubts, update_time: this.updateTime })); // 只写本地，不触发最新时间戳
                    
                    if(statusEl) statusEl.innerHTML = "<span style='color:#4caf50;'>✅ 已拉取云端最新进度</span>";
                    if(document.getElementById('question-card').innerHTML !== '') { this.updateProgress(); this.renderQuestion(); }
                } else if (this.updateTime > cloudUpdateTime) {
                    // 本地时间比云端新：自动将本地更新反向推送到云端
                    if(statusEl) statusEl.innerHTML = "<span style='color:#2196f3;'>🚀 本地进度超前，正推向云端...</span>";
                    this.forceCloudSync();
                } else {
                    // 完全一致
                    if(statusEl) statusEl.innerHTML = "<span style='color:#4caf50;'>✅ 与云端保持同步</span>";
                }
            }
        } catch (e) {
            console.error("【同步拉取异常】", e);
            if(statusEl) {
                statusEl.innerHTML = "<span style='color:#d32f2f; cursor:pointer;'>❌ 同步失败(点我)</span>";
                statusEl.onclick = () => alert(`🚨 拉取失败: ${e.message}\n您的数据已安全保存在本地，不影响继续做题。`);
            }
        }
    },

    async saveToGist() {
        if (!this.gistConfig.id || !this.gistConfig.token) return;
        const statusEl = document.getElementById('sync-status');
        if(statusEl) { statusEl.innerHTML = "<span style='color:#f57c00;'>⏳ 正在上云...</span>"; statusEl.onclick = null; }
        
        try {
            // 打包时，严格携带本地的精确时间戳
            const payload = { answers: this.answers, doubts: this.doubts, update_time: this.updateTime };
            const cleanId = this.gistConfig.id.trim();
            const cleanToken = this.gistConfig.token.trim();
            
            const res = await this.fetchWithTimeout(`https://api.github.com/gists/${cleanId}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${cleanToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: { 'ipip_answers.json': { content: JSON.stringify(payload) } } })
            }, 10000);
            
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            if(statusEl) statusEl.innerHTML = "<span style='color:#4caf50;'>✅ 进度已安全上云</span>";
            
        } catch (e) { 
            console.error("【同步保存异常】", e);
            if(statusEl) {
                statusEl.innerHTML = "<span style='color:#d32f2f; cursor:pointer;'>❌ 上传失败(点我)</span>";
                statusEl.onclick = () => alert(`🚨 保存失败: ${e.message}\n\n不用担心！进度已绝对安全地保存在本机缓存中。网络恢复后点顶部的云同步按钮即可。`);
            }
        }
    },

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
            <div class="q-number">题目进度： ${this.currentIndex + 1} / ${this.questions.length}</div>
            <div class="q-title">${q.Item}</div>
            <div class="q-anchor">${parsedAnchor}</div>
            
            <div class="options-area">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; padding: 0 5%; transition: all 0.3s;">
                    <div onclick="app.toggleDoubt(${q.Number})" style="cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; background: ${hasDoubt ? '#fff3e0' : '#f5f5f5'}; color: ${hasDoubt ? '#f57c00' : '#888'}; font-weight: bold; font-size: 14px; border: 1px solid ${hasDoubt ? '#ffcc80' : '#e0e0e0'};">
                        <span style="font-size: 16px;">❓</span> ${hasDoubt ? '取消疑问' : '有疑问'}
                    </div>
                    <input type="text" id="doubt-input-${q.Number}" placeholder="具体是哪里有疑问？" value="${doubtText}" onblur="app.saveDoubt(${q.Number}, this.value)" style="flex: 1; margin-left: 12px; padding: 8px 12px; border: 1px solid #ffb74d; border-radius: 6px; outline: none; font-size: 14px; display: ${hasDoubt ? 'block' : 'none'}; box-shadow: inset 0 1px 3px rgba(0,0,0,0.05);">
                </div>

                <div class="row-int">
                    ${[1, 2, 3, 4, 5].map(v => `<div class="opt-btn ${currentAnswer === v ? 'selected' : ''}" onclick="app.selectOption(${q.Number}, ${v}, this)">${v} <span class="label">${labels[v]}</span></div>`).join('')}
                </div>
                <div class="row-half">
                    ${[1.5, 2.5, 3.5, 4.5].map(v => `<div class="opt-btn ${currentAnswer === v ? 'selected' : ''}" onclick="app.selectOption(${q.Number}, ${v}, this)">${v}</div>`).join('')}
                </div>
            </div>
        `;
        
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
        if (this.doubts[qNumber] !== undefined) delete this.doubts[qNumber]; 
        else this.doubts[qNumber] = ""; 
        this.saveLocalData();
        this.triggerCloudSave(); 
        this.renderQuestion(); 
        if (this.doubts[qNumber] !== undefined) setTimeout(() => document.getElementById(`doubt-input-${qNumber}`).focus(), 50);
    },

    saveDoubt(qNumber, text) {
        if (this.doubts[qNumber] !== undefined) {
            this.doubts[qNumber] = text.trim();
            this.saveLocalData();
            this.triggerCloudSave();
        }
    },

    selectOption(qNumber, value, element) {
        if (this.answers[qNumber] === value) {
            delete this.answers[qNumber];
            element.classList.remove('selected');
            this.saveLocalData();
            this.updateProgress();
            this.triggerCloudSave(); 
            this.renderQuestion(); 
            return;
        }

        this.answers[qNumber] = value;
        this.saveLocalData();
        
        document.querySelectorAll('.opt-btn').forEach(btn => btn.classList.remove('selected'));
        element.classList.add('selected');
        
        this.updateProgress();
        this.triggerCloudSave(); 
        setTimeout(() => this.goNext(), 300);
    },

    skipQuestion() {
        this.answers[this.questions[this.currentIndex].Number] = 'skip';
        this.saveLocalData();
        this.triggerCloudSave();
        this.goNext();
    },

    goPrev() { 
        if(this.currentIndex > 0) { 
            this.currentIndex--; 
            this.slideDirection = 'right'; 
            this.renderQuestion(); 
        } 
    },
    
    goNext() { 
        this.currentIndex++; 
        this.slideDirection = 'left'; 
        if(this.currentIndex >= this.questions.length) this.showResults(); 
        else this.renderQuestion(); 
    },

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
                this.answers = content.answers;
                this.doubts = content.doubts || {};
                this.updateTime = content.update_time || Date.now();
            } else {
                this.answers = content;
                this.doubts = {};
                this.updateTime = Date.now();
            }
            this.saveLocalData();
            this.forceCloudSync(); // 导入后强推覆盖云端
            alert("✅ 导入成功！正在刷新页面...");
            location.reload(); 
        } catch (e) { alert("❌ 损坏的进度码，无法识别。"); }
    },

    calculateScores() {
        const itemResults = [];
        const domainStats = { N: {sum:0, count:0}, E: {sum:0, count:0}, O: {sum:0, count:0}, A: {sum:0, count:0}, C: {sum:0, count:0} };

        this.questions.forEach(q => {
            let ans = this.answers[q.Number];
            if (ans && ans !== 'skip') {
                let scored = q.Sign === "_" ? 6 - ans : ans;
                domainStats[q.Facet.charAt(0)].sum += scored;
                domainStats[q.Facet.charAt(0)].count += 1;
                
                const doubt = this.doubts[q.Number] || '';
                itemResults.push({ Number: q.Number, Facet: q.Facet, Sign: q.Sign, Raw: ans, Scored: scored, Doubt: doubt, Item: q.Item });
            }
        });
        return { itemResults, domainStats };
    },

    showResults() {
        document.getElementById('quiz-screen').style.display = 'none';
        document.getElementById('result-screen').style.display = 'block';
        const { domainStats } = this.calculateScores();
        let html = "";
        for (let d in domainStats) {
            if(domainStats[d].count > 0) html += `<tr><td><strong>${this.domainMap[d]}</strong></td><td>${domainStats[d].count}</td><td>${domainStats[d].sum}</td></tr>`;
        }
        document.querySelector('#domain-table tbody').innerHTML = html;
        this.forceCloudSync(); // 做完后强行备份一次
    },

    exportCSV() {
        let csv = "\uFEFF题号,分面,方向,原始分,计分,疑问备注,题目\n";
        this.calculateScores().itemResults.forEach(r => csv += `${r.Number},${r.Facet},${r.Sign},${r.Raw},${r.Scored},${r.Doubt.replace(/,/g, "，")},${r.Item.replace(/,/g, "，")}\n`);
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        link.download = "IPIP_NEO_Results_带备注.csv";
        link.click();
    }
};