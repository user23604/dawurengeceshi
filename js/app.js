const app = {
    questions: [],
    answers: {},
    doubts: {}, // 专门存放疑问的数据库
    currentIndex: 0,
    slideDirection: '',
    domainMap: { 'N':'神经质', 'E':'外向性', 'O':'开放性', 'A':'宜人性', 'C':'尽责性' },
    
    gistConfig: {
        id: localStorage.getItem('gist_id') || '',
        token: localStorage.getItem('gist_token') || ''
    },

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
            
            if (this.gistConfig.id && this.gistConfig.token) {
                await this.loadFromGist();
            } else {
                this.loadLocalData();
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

    // --- 数据兼容与读写引擎 ---
    loadLocalData() {
        const localData = JSON.parse(localStorage.getItem('ipip_answers')) || {};
        // 兼容新老数据格式
        if (localData.answers !== undefined) {
            this.answers = localData.answers;
            this.doubts = localData.doubts || {};
        } else {
            this.answers = localData; // 旧版只存了答案字典
            this.doubts = {};
        }
    },
    
    saveLocalData() {
        localStorage.setItem('ipip_answers', JSON.stringify({ answers: this.answers, doubts: this.doubts }));
    },

    async loadFromGist() {
        const statusEl = document.getElementById('sync-status');
        if(statusEl) statusEl.innerHTML = "<span style='color:#f57c00;'>⏳ 拉取云端中...</span>";
        try {
            const url = `https://api.github.com/gists/${this.gistConfig.id}?t=${new Date().getTime()}`;
            const res = await fetch(url, { headers: { 'Authorization': `token ${this.gistConfig.token}`, 'Cache-Control': 'no-cache' }});
            if (!res.ok) throw new Error("验证失败");
            
            const data = await res.json();
            const content = JSON.parse(data.files['ipip_answers.json'].content);
            
            if (content.answers !== undefined) {
                this.answers = content.answers;
                this.doubts = content.doubts || {};
            } else {
                this.answers = content;
                this.doubts = {};
            }
            this.saveLocalData();
            if(statusEl) statusEl.innerHTML = "<span style='color:#4caf50;'>✅ 云端已同步</span>";
        } catch (e) {
            console.error("云端加载失败", e);
            if(statusEl) statusEl.innerHTML = "<span style='color:#d32f2f;'>❌ 同步失败，使用本地</span>";
            this.loadLocalData();
        }
    },

    async saveToGist() {
        if (!this.gistConfig.id || !this.gistConfig.token) return;
        const statusEl = document.getElementById('sync-status');
        if(statusEl) statusEl.innerHTML = "<span style='color:#f57c00;'>⏳ 正在保存...</span>";
        try {
            const payload = { answers: this.answers, doubts: this.doubts };
            const res = await fetch(`https://api.github.com/gists/${this.gistConfig.id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `token ${this.gistConfig.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: { 'ipip_answers.json': { content: JSON.stringify(payload) } } })
            });
            if (!res.ok) throw new Error("保存失败");
            if(statusEl) statusEl.innerHTML = "<span style='color:#4caf50;'>✅ 已云端保存</span>";
        } catch (e) { 
            if(statusEl) statusEl.innerHTML = "<span style='color:#d32f2f;'>❌ 保存失败</span>";
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

        // 终极完美解析排版引擎 (Flexbox 解析法，彻底根除错位)
        const parsedAnchor = q.Anchor.split('\\n').map(line => {
            line = line.trim();
            if(!line) return '';
            if(line.startsWith('•')) {
                return `<div style="display: flex; align-items: flex-start; margin-bottom: 6px;">
                            <span style="color: #2196f3; margin-right: 8px; font-weight: bold; font-size: 18px; line-height: 1.4;">•</span>
                            <span style="flex: 1; line-height: 1.5;">${line.substring(1).trim()}</span>
                        </div>`;
            }
            return `<div style="margin-bottom: 6px; line-height: 1.5;">${line}</div>`;
        }).join('');

        // 疑问区状态
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

    // --- 新增：疑问功能交互 ---
    toggleDoubt(qNumber) {
        if (this.doubts[qNumber] !== undefined) {
            delete this.doubts[qNumber]; // 取消疑问
        } else {
            this.doubts[qNumber] = ""; // 激活疑问框
        }
        this.saveLocalData();
        this.saveToGist();
        this.renderQuestion(); // 重新渲染刷新 UI
        
        // 如果是展开框，自动聚焦输入
        if (this.doubts[qNumber] !== undefined) {
            setTimeout(() => document.getElementById(`doubt-input-${qNumber}`).focus(), 50);
        }
    },

    saveDoubt(qNumber, text) {
        if (this.doubts[qNumber] !== undefined) {
            this.doubts[qNumber] = text.trim();
            this.saveLocalData();
            this.saveToGist();
        }
    },

    // --- 修复：反选 Bug ---
    selectOption(qNumber, value, element) {
        // 如果点击的是已经选中的答案 -> 执行取消选择
        if (this.answers[qNumber] === value) {
            delete this.answers[qNumber];
            element.classList.remove('selected');
            this.saveLocalData();
            this.updateProgress();
            this.saveToGist();
            this.renderQuestion(); // 刷新以重置下方按钮状态
            return;
        }

        // 正常选择
        this.answers[qNumber] = value;
        this.saveLocalData();
        
        document.querySelectorAll('.opt-btn').forEach(btn => btn.classList.remove('selected'));
        element.classList.add('selected');
        
        this.updateProgress();
        this.saveToGist(); 
        setTimeout(() => this.goNext(), 300);
    },

    skipQuestion() {
        this.answers[this.questions[this.currentIndex].Number] = 'skip';
        this.saveLocalData();
        this.saveToGist(); 
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
        if (Object.keys(this.answers).length === 0) return alert("暂无记录！");
        const payload = { answers: this.answers, doubts: this.doubts };
        const code = btoa(JSON.stringify(payload));
        navigator.clipboard.writeText(code).then(() => alert("✅ 进度码已复制！")).catch(() => prompt("手动复制：", code));
    },

    importSaveCode() {
        const code = prompt("粘贴进度码：");
        if (!code) return;
        try {
            const content = JSON.parse(atob(code));
            if (content.answers !== undefined) {
                this.answers = content.answers;
                this.doubts = content.doubts || {};
            } else {
                this.answers = content;
                this.doubts = {};
            }
            this.saveLocalData();
            this.saveToGist();
            location.reload(); 
        } catch (e) { alert("❌ 损坏的进度码"); }
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
                
                // 导出数据时，加入疑问备注
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
    },

    exportCSV() {
        // 更新了表头，加入了“疑问备注”列
        let csv = "\uFEFF题号,分面,方向,原始分,计分,疑问备注,题目\n";
        this.calculateScores().itemResults.forEach(r => csv += `${r.Number},${r.Facet},${r.Sign},${r.Raw},${r.Scored},${r.Doubt.replace(/,/g, "，")},${r.Item.replace(/,/g, "，")}\n`);
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        link.download = "IPIP_NEO_Results_带备注.csv";
        link.click();
    }
};