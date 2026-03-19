// ==========================================
// AES-256 GCM Encryption via Web Crypto API
// Defined at MODULE LEVEL so all app methods can access it
// ==========================================
const CryptoUtil = {
    async deriveKey(password) {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
        );
        return window.crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: enc.encode("ipip-neo-salt-v1"), iterations: 100000, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
        );
    },
    async encrypt(data, password) {
        const key = await this.deriveKey(password);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder();
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv }, key, enc.encode(data)
        );
        return {
            iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
            data: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
        };
    },
    async decrypt(encryptedObj, password) {
        try {
            const key = await this.deriveKey(password);
            const iv = new Uint8Array(encryptedObj.iv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            const ciphertext = Uint8Array.from(atob(encryptedObj.data), c => c.charCodeAt(0));
            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv }, key, ciphertext
            );
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error("Decryption failed:", e);
            throw new Error("Decryption failed. Incorrect password or corrupted data.");
        }
    }
};

const app = {
    questions: [],
    answers: {},
    doubts: {},
    history: [], // 🌟 新增：存放历次测试的“时光机”数组
    currentIndex: 0,
    slideDirection: '',
    scaleConfig: null,
    domainMap: {},

    gistConfig: {
        id: localStorage.getItem('gist_id') || '',
        token: localStorage.getItem('gist_token') || ''
    },

    updateTime: 0,
    syncCooldown: 15000,
    lastApiCallTime: 0,
    needsSync: false,
    syncTimer: null,

    getScaleConfig(scaleType) {
        if (scaleType === 'pid5') {
            return {
                id: 'pid5',
                name: 'PID-5 人格测验',
                dataFile: 'data/PID5_题库_web_ready.json',
                localKey: 'pid5_answers',
                gistFileName: 'pid5_answers.json',
                scoreMode: '0-3',   // Official PID-5 uses 0-3
                halfSteps: [0.5, 1.5, 2.5],
                domainMap: {
                    'Negative Affect': '负性情感',
                    'Detachment': '疏离',
                    'Antagonism': '对抗',
                    'Disinhibition': '去抑制',
                    'Psychoticism': '精神病性风格',
                    'Other': '其他'
                }
            };
        } else if (scaleType === 'bdi2') {
            return {
                id: 'bdi2',
                name: '贝克抑郁量表 (BDI-II)',
                dataFile: 'data/bdi2_questions.json',
                localKey: 'bdi2_answers',
                gistFileName: 'bdi2_answers.json',
                scoreMode: '0-3',
                halfSteps: [], // No half steps for BDI-II
                domainMap: { 'Emotional': '情绪症状', 'Cognitive': '认知症状', 'Somatic': '躯体症状' }
            };
        } else if (scaleType === 'bai') {
            return {
                id: 'bai',
                name: '贝克焦虑量表 (BAI)',
                dataFile: 'data/bai_questions.json',
                localKey: 'bai_answers',
                gistFileName: 'bai_answers.json',
                scoreMode: '0-3',
                halfSteps: [], // No half steps for BAI
                domainMap: { 'Neurophysiological': '神经生理症状', 'Panic-Subjective': '恐慌-主观症状' }
            };
        } else if (scaleType === 'ysq') {
            return {
                id: 'ysq',
                name: '杨氏图式问卷简明版 (YSQ-S3)',
                dataFile: 'data/ysq_s3_questions.json',
                localKey: 'ysq_answers',
                gistFileName: 'ysq_answers.json',
                scoreMode: '1-6',
                halfSteps: [],
                domainMap: {
                    'ED': '情感剥夺', 'AB': '被抛弃', 'MA': '不信任/虐待', 'SI': '社会隔离', 'DS': '缺陷/羞耻',
                    'FA': '失败', 'DI': '依赖/无能', 'VU': '疾病伤害脆弱性', 'EM': '纠缠/未分化', 'SB': '屈从',
                    'SS': '自我牺牲', 'EI': '情感压抑', 'US': '苛刻标准', 'ET': '特权/宏大', 'IS': '缺乏自控',
                    'AS': '寻求赞扬', 'NP': '消极/悲观', 'PU': '惩罚'
                }
            };
        }

        // Default to Big Five
        return {
            id: 'bigfive',
            name: '大五人格 (IPIP-NEO-300)',
            dataFile: 'data/questions.json',
            localKey: 'ipip_answers',
            gistFileName: 'ipip_answers.json',
            scoreMode: '1-5',
            halfSteps: [1.5, 2.5, 3.5, 4.5],
            domainMap: { 'N': '神经质', 'E': '外向性', 'O': '开放性', 'A': '宜人性', 'C': '尽责性' }
        };
    },

    async init() {
        const urlParams = new URLSearchParams(window.location.search);
        const keyFromUrl = urlParams.get('key');
        const CORRECT_KEY = '11115555';

        const scaleType = urlParams.get('scale') || 'bigfive';
        this.scaleConfig = this.getScaleConfig(scaleType);
        this.domainMap = this.scaleConfig.domainMap;
        document.title = this.scaleConfig.name;

        if (keyFromUrl === CORRECT_KEY) localStorage.setItem('access_key', keyFromUrl);

        if (localStorage.getItem('access_key') !== CORRECT_KEY) {
            document.body.innerHTML = `
                <div style="text-align:center; margin-top:100px; font-family:sans-serif; padding: 20px;">
                    <h2>🔒 受保护的内容</h2>
                    <p style="color:var(--text-muted); margin-bottom:20px;">请输入暗号进入测试：</p>
                    <input type="password" id="pwd" style="padding:12px; width:80%; max-width:200px; border-radius:5px; border:1px solid #ccc; font-size:16px;">
                    <br><br>
                    <button onclick="const k=document.getElementById('pwd').value; if(k==='${CORRECT_KEY}'){localStorage.setItem('access_key',k); location.reload();}else{alert('密码错误');}" style="padding:12px 30px; cursor:pointer; background:#2196f3; color:#fff; border:none; border-radius:5px; font-size:16px;">进入</button>
                </div>`;
            return;
        }

        this.initSwipeGesture();

        try {
            const timestamp = new Date().getTime();
            this.accessKey = localStorage.getItem('access_key'); // 用于加密的密钥

            const response = await fetch(`${this.scaleConfig.dataFile}?t=${timestamp}`);
            if (!response.ok) throw new Error("无法读取题库文件");
            const rawData = await response.json();

            // Normalize JSON data source — supports both old Big Five format and new PID-5 format
            let questionsArray = rawData.questions || rawData;
            this.questions = questionsArray.map(q => {
                // Derive domain: prefer domain_primary (PID-5), then domain_code, then first char of facet
                const domainRaw = q.domain_primary || q.domain_code || null;
                // For PID-5: use full domain string; for bigfive: first char
                const Domain = domainRaw || (q.Facet ? q.Facet.charAt(0) : 'Other');

                // Determine reverse scoring
                const isReverse = (q.scoring && q.scoring.reverse === true) ||
                    q.reverse === true || q.sign === '-' || q.Sign === '_';
                const Sign = isReverse ? '_' : '+';

                // Build anchor/examples text
                let Anchor = '';
                if (q.examples) {
                    const ml = q.examples.more_like_me || '';
                    const ll = q.examples.less_like_me || '';
                    const parts = [];
                    if (ml) parts.push(`• 更像我：${ml}`);
                    if (ll) parts.push(`• 不像我：${ll}`);
                    Anchor = parts.join('\\n');
                } else if (q.anchors) {
                    Anchor = q.anchors.map(a => `• ${a}`).join('\\n');
                } else {
                    Anchor = q.Anchor || '';
                }

                return {
                    Number: q.number || q.Number,
                    Item: q.text || q.Item,
                    Facet: q.facet || q.Facet || Domain,
                    FacetHint: q.facet_hint_zh || '',
                    Domain,
                    Sign,
                    Anchor,
                    options: q.options || null   // BDI-II style per-item options
                };
            });

            // Allow meta to override config if defined
            if (rawData.meta && rawData.meta.domain_map) {
                this.domainMap = rawData.meta.domain_map;
            }
            // Store clinical interpretation thresholds for result page severity display
            this._metaInterpretation = (rawData.meta && rawData.meta.interpretation) ? rawData.meta.interpretation : null;

            this.loadLocalData();
            if (this.gistConfig.id && this.gistConfig.token) {
                await this.loadFromGist();
            }

            // Find first truly unanswered question (undefined = no selection at all). 
            // 'skip' is NOT undefined, so skipped questions do not count as resume targets.
            // CRITICALLY: must use === undefined (not !answer) because 0 is a valid PID-5 answer.
            this.currentIndex = this.questions.findIndex(q => this.answers[q.Number] === undefined);
            if (this.currentIndex === -1) this.currentIndex = this.questions.length - 1;

            this.initProgressBar();
            this.initDrawer();
            this.renderQuestion();
        } catch (error) {
            console.error("初始化错误：", error);
            document.getElementById('question-card').innerHTML = `<div style="color:red; text-align:center; padding: 30px;">❌ 数据加载失败</div>`;
        }
    },

    // --- 数据持久化层（加入了 history） ---
    loadLocalData() {
        const localData = JSON.parse(localStorage.getItem(this.scaleConfig.localKey)) || {};
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
        localStorage.setItem(this.scaleConfig.localKey, JSON.stringify({
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
            if (statusEl) statusEl.innerHTML = `<span style='color:var(--text-muted);'>💾 本地秒存 (冷却中)</span>`;
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

    // Helper to export current state for Gist
    exportState() {
        return {
            answers: this.answers,
            doubts: this.doubts,
            history: this.history,
            update_time: this.updateTime
        };
    },

    // Helper to import state from Gist
    importState(state) {
        this.answers = state.answers !== undefined ? state.answers : {};
        this.doubts = state.doubts || {};
        this.history = state.history || [];
        this.updateTime = state.update_time || 0;
        localStorage.setItem(this.scaleConfig.localKey, JSON.stringify({ answers: this.answers, doubts: this.doubts, history: this.history, update_time: this.updateTime }));
    },

    async loadFromGist() {
        const statusEl = document.getElementById('sync-status');
        if (statusEl) { statusEl.innerHTML = "<span style='color:#f57c00;'>⏳ 检查云端更新...</span>"; statusEl.onclick = null; }

        try {
            const cleanId = this.gistConfig.id.trim();
            const cleanToken = this.gistConfig.token.trim();
            const url = `https://api.github.com/gists/${cleanId}?t=${new Date().getTime()}`;

            const res = await this.fetchWithTimeout(url, { headers: { 'Authorization': `Bearer ${cleanToken}` } }, 10000);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            const GIST_FILENAME = this.scaleConfig.gistFileName;

            if (data.files && data.files[GIST_FILENAME]) {
                if (statusEl) statusEl.textContent = '读取云端数据解密中...';
                const file = data.files[GIST_FILENAME];
                if (file) {
                    try {
                        const encryptedObj = JSON.parse(file.content);
                        const decryptedStr = await CryptoUtil.decrypt(encryptedObj, this.accessKey);
                        const state = JSON.parse(decryptedStr);

                        if (state.update_time > this.updateTime) {
                            this.importState(state);
                            if (statusEl) statusEl.innerHTML = "<span style='color:#4caf50;'>✅ 已拉取云端进度</span>";
                            if (document.getElementById('question-card').innerHTML !== '') { this.updateProgress(); this.renderQuestion(); }
                        } else if (this.updateTime > state.update_time) {
                            if (statusEl) statusEl.innerHTML = "<span style='color:#2196f3;'>🚀 本地超前，推送中...</span>";
                            this.forceCloudSync();
                        } else {
                            if (statusEl) statusEl.innerHTML = "<span style='color:#4caf50;'>✅ 保持同步</span>";
                        }
                    } catch (e) {
                        console.error('解密失败:', e);
                        // Fallback parsing for old unencrypted base64 data to avoid breaking existing users during upgrade
                        try {
                            const decoded = decodeURIComponent(atob(file.content));
                            const state = JSON.parse(decoded);
                            if (state.update_time > this.updateTime) {
                                this.importState(state);
                                if (statusEl) statusEl.innerHTML = "<span style='color:#4caf50;'>✅ 云端旧格式已同步</span>";
                                if (document.getElementById('question-card').innerHTML !== '') { this.updateProgress(); this.renderQuestion(); }
                            } else if (this.updateTime > state.update_time) {
                                if (statusEl) statusEl.innerHTML = "<span style='color:#2196f3;'>🚀 本地超前，推送中...</span>";
                                this.forceCloudSync();
                            } else {
                                if (statusEl) statusEl.innerHTML = "<span style='color:#4caf50;'>✅ 保持同步</span>";
                            }
                        } catch (e2) {
                            alert('云端数据格式错误或解密失败，请检查授权码是否正确。');
                            if (statusEl) statusEl.innerHTML = "<span style='color:#d32f2f; cursor:pointer;'>❌ 同步失败(点我)</span>";
                            statusEl.onclick = () => alert(`🚨 拉取失败: ${e.message}\n旧格式解析失败: ${e2.message}`);
                        }
                    }
                }
            } else {
                // File does not exist in Gist yet (e.g., first time doing PID-5 while Big Five file exists)
                // We should NOT throw an error. Instead, push local to create it.
                if (statusEl) statusEl.innerHTML = "<span style='color:#2196f3;'>☁️ 云端新建文件中...</span>";
                this.forceCloudSync();
            }
        } catch (e) {
            console.error("【同步拉取异常】", e);
            if (statusEl) {
                statusEl.innerHTML = "<span style='color:#d32f2f; cursor:pointer;'>❌ 同步失败(点我)</span>";
                statusEl.onclick = () => alert(`🚨 拉取失败: ${e.message}`);
            }
        }
    },

    async saveToGist() {
        if (!this.gistConfig.id || !this.gistConfig.token) return;
        const statusEl = document.getElementById('sync-status');
        if (statusEl) { statusEl.innerHTML = "<span style='color:#f57c00;'>⏳ 正在上云...</span>"; statusEl.onclick = null; }

        try {
            // 打包所有数据，包含 history
            const statePayload = { answers: this.answers, doubts: this.doubts, history: this.history, update_time: this.updateTime };
            const encryptedPayload = await CryptoUtil.encrypt(JSON.stringify(statePayload), this.accessKey);

            const cleanId = this.gistConfig.id.trim();
            const cleanToken = this.gistConfig.token.trim();

            const res = await this.fetchWithTimeout(`https://api.github.com/gists/${cleanId}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${cleanToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: { [this.scaleConfig.gistFileName]: { content: JSON.stringify(encryptedPayload) } } })
            }, 10000);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            if (statusEl) statusEl.innerHTML = "<span style='color:#4caf50;'>✅ 已安全上云</span>";

        } catch (e) {
            console.error("【同步保存异常】", e);
            if (statusEl) {
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
        const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

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

        let listHtml = this.history.length === 0 ? '<div style="text-align:center; padding: 30px; color:var(--text-muted);">暂无历史归档记录</div>' : '';

        this.history.forEach((h, index) => {
            const ansCount = Object.keys(h.answers).length;
            listHtml += `
            <div style="border:1px solid var(--border-color); padding:15px; border-radius:10px; margin-bottom:12px; background:var(--bg-secondary); display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:bold; color:var(--text-main); font-size: 15px;">档案 ${this.history.length - index}</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:6px;">🕒 ${h.date} | 已答 ${ansCount} 题</div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button onclick="app.exportExcel(${index})" style="padding:6px 12px; border:none; background:#4caf50; color:#fff; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold;">📊 Excel</button>
                    <button onclick="app.exportMarkdown(${index})" style="padding:6px 12px; border:none; background:#8b5cf6; color:#fff; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold;">📝 MD</button>
                    <button onclick="app.deleteHistory(${index})" style="padding:6px 12px; border:none; background:#ef5350; color:#fff; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold;">删除</button>
                </div>
            </div>`;
        });

        const modalHtml = `
        <div id="history-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; display:flex; justify-content:center; align-items:center;">
            <div style="background:var(--bg-primary); border:1px solid var(--border-color); padding:25px; border-radius:16px; width:90%; max-width:450px; max-height:80vh; display:flex; flex-direction:column; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
                    <h3 style="margin:0; font-size:20px; color:var(--text-main);">📜 历史归档记录</h3>
                    <button onclick="document.getElementById('history-modal').remove()" style="background:none; border:none; font-size:24px; color:var(--text-muted); cursor:pointer;">&times;</button>
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
    async exportExcel(historyIndex = null) {
        if (typeof XLSX === 'undefined') {
            alert("Excel 引擎仍在加载，请等待几秒钟后再点！");
            return;
        }

        // 判断是导出当前进度，还是导出历史记录
        const targetAnswers = historyIndex !== null ? this.history[historyIndex].answers : this.answers;
        const targetDoubts = historyIndex !== null ? this.history[historyIndex].doubts : this.doubts;
        const targetDate = historyIndex !== null ? this.history[historyIndex].date.replace(/[: ]/g, "_") : "当前最新";

        if (Object.keys(targetAnswers).length === 0) return alert("该记录中没有答题数据！");

        // 计算所有得分数据 (Offloaded to Web Worker)
        const { itemResults, domainStats, facetStats } = await this.calculateScoresData(targetAnswers, targetDoubts);

        // 创建空的工作簿
        const wb = XLSX.utils.book_new();

        // Sheet 1: 五大维度
        const ws1_data = [["维度代码", "维度名称", "总分"]];
        for (let d in domainStats) { ws1_data.push([d, this.domainMap[d], domainStats[d].sum]); }
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
        XLSX.writeFile(wb, `${this.scaleConfig.name}_专业分析报告_${targetDate}.xlsx`);
    },

    // 内部剥离的计算引擎，使用 Web Worker 进行多线程免主线程卡顿计算
    calculateScoresData(ansObj, doubtObj) {
        return new Promise((resolve, reject) => {
            const worker = new Worker('js/worker.js');
            worker.onmessage = (e) => {
                resolve(e.data);
                worker.terminate();
            };
            worker.onerror = (err) => {
                console.error("Worker计算失败:", err);
                reject(err);
                worker.terminate();
            };
            worker.postMessage({
                questions: this.questions,
                ansObj: ansObj,
                doubtObj: doubtObj,
                scoreMode: this.scaleConfig.scoreMode || '1-5'
            });
        });
    },

    // --- 🌟 导出 Markdown 报告 ---
    async exportMarkdown(historyIndex = null) {
        const targetAnswers = historyIndex !== null ? this.history[historyIndex].answers : this.answers;
        const targetDoubts = historyIndex !== null ? this.history[historyIndex].doubts : this.doubts;
        const targetDate = historyIndex !== null ? this.history[historyIndex].date.replace(/[: ]/g, "_") : "当前最新";
        const displayDate = historyIndex !== null ? this.history[historyIndex].date : new Date().toLocaleString();

        if (Object.keys(targetAnswers).length === 0) return alert("该记录中没有答题数据！");

        const btn = event?.currentTarget;
        const originalText = btn ? btn.innerHTML : '';
        if (btn) btn.innerHTML = '⏳ 生成中...';

        try {
            const { itemResults, domainStats, facetStats } = await this.calculateScoresData(targetAnswers, targetDoubts);
            
            let md = `# ${this.scaleConfig.name} 测试报告\n\n`;
            md += `**生成时间**：${displayDate}\n\n`;
            md += `---\n\n`;

            // 1. 各维度得分
            md += `## 📊 核心维度得分\n\n`;
            md += `| 维度代码 | 维度名称 | 总分 |\n`;
            md += `| :--- | :--- | :--- |\n`;
            let totalScore = 0;
            for (let d in domainStats) {
                if (domainStats[d].count > 0) {
                    const domainLabel = this.domainMap[d] || d;
                    md += `| **${d}** | ${domainLabel} | **${domainStats[d].sum}** |\n`;
                    totalScore += domainStats[d].sum;
                }
            }
            md += `\n`;

            // 评级解读 (针对 BAI / BDI-II)
            if (['bai', 'bdi2'].includes(this.scaleConfig.id) && this._metaInterpretation) {
                const level = this._metaInterpretation.find(r => totalScore >= r.min && totalScore <= r.max);
                if (level) {
                    md += `> **量表总分**：\`${totalScore}\`，临床评级：**${level.label}**\n\n`;
                }
            }

            // 2. 子面得分
            if (Object.keys(facetStats).length > 0) {
                md += `## 📑 子面详细得分\n\n`;
                md += `| 子面代码 | 总分 |\n`;
                md += `| :--- | :--- |\n`;
                const sortedFacets = Object.keys(facetStats).sort();
                sortedFacets.forEach(f => {
                    md += `| ${f} | ${facetStats[f].sum} |\n`;
                });
                md += `\n`;
            }

            // 3. 疑问汇总
            const doubts = itemResults.filter(r => r.Doubt);
            if (doubts.length > 0) {
                md += `## ❓ 测试过程中的疑问\n\n`;
                doubts.forEach(r => {
                    md += `- **第 ${r.Number} 题** (${r.Facet})：*${r.Item}*\n`;
                    md += `  - 📝 **用户备注**：${r.Doubt}\n`;
                    md += `  - 原始选项：${r.Raw}\n`;
                });
                md += `\n`;
            }

            md += `---\n\n`;
            md += `*本报告由系统自动生成，仅供参考。*\n`;

            // Trigger Download
            const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.scaleConfig.name}_评估报告_${targetDate}.md`;
            a.click();
            URL.revokeObjectURL(url);

        } catch (e) {
            console.error("Markdown 导出失败:", e);
            alert("导出失败，请重试！");
        } finally {
            if (btn) btn.innerHTML = originalText;
        }
    },

    // 供结果页展示用的简易计算器
    async calculateScores() { return await this.calculateScoresData(this.answers, this.doubts); },
    async showResults() {
        document.getElementById('quiz-screen').style.display = 'none';
        document.getElementById('result-screen').style.display = 'block';
        document.querySelector('#domain-table tbody').innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 40px; color: var(--text-muted);">正在进行大数据分析处理... (依托 Web Worker)</td></tr>';

        const { domainStats } = await this.calculateScores();
        let html = '';

        const chartData = [];
        const chartIndicator = [];

        // Adapt result table header to scale type
        const isPersonality = (this.scaleConfig.id === 'bigfive' || this.scaleConfig.id === 'pid5' || this.scaleConfig.id === 'ysq');
        const colHeader = isPersonality ? '人格特质 / 维度' : '症状维度';
        document.querySelector('#domain-table thead tr').innerHTML = `<th>${colHeader}</th><th>计分题数</th><th>原始分</th>`;

        let totalScore = 0;
        for (let d in domainStats) {
            if (domainStats[d].count > 0) {
                const domainLabel = this.domainMap[d] || d;
                html += `<tr><td><strong>${domainLabel}</strong></td><td>${domainStats[d].count}</td><td>${domainStats[d].sum}</td></tr>`;
                // For radar chart: max score = count * maxPerItem
                let maxPerItem = 5;
                if (this.scaleConfig.scoreMode === '0-3') maxPerItem = 3;
                else if (this.scaleConfig.scoreMode === '1-6') maxPerItem = 6;
                chartIndicator.push({ name: domainLabel, max: domainStats[d].count * maxPerItem });
                chartData.push(domainStats[d].sum);
                totalScore += domainStats[d].sum;
            }
        }

        // Show total score + clinical severity for BAI / BDI-II
        const interpretation = this.scaleConfig.meta_interpretation || null;
        if (['bai', 'bdi2'].includes(this.scaleConfig.id)) {
            // Fetch interpretation from the loaded JSON meta (stored on scaleConfig)
            const interp = this._metaInterpretation;
            let severityHtml = '';
            if (interp && interp.length > 0) {
                const level = interp.find(r => totalScore >= r.min && totalScore <= r.max);
                if (level) {
                    severityHtml = `<div style="margin-bottom:16px; padding:14px 20px; border-radius:10px; background:${level.color}22; border: 1px solid ${level.color}55; font-size:15px;">
                        总分：<strong style="font-size:20px; color:${level.color}">${totalScore}</strong> &nbsp;·&nbsp; 评级：<strong style="color:${level.color}">${level.label}</strong>
                    </div>`;
                }
            } else {
                severityHtml = `<div style="margin-bottom:16px; padding:14px 20px; border-radius:10px; background:rgba(139,92,246,0.1); border:1px solid rgba(139,92,246,0.3); font-size:15px;">总分：<strong style="font-size:20px; color:#a78bfa">${totalScore}</strong></div>`;
            }
            const existingSev = document.getElementById('severity-block');
            if (existingSev) existingSev.remove();
            const sevDiv = document.createElement('div');
            sevDiv.id = 'severity-block';
            sevDiv.innerHTML = severityHtml;
            document.querySelector('#domain-table').insertAdjacentElement('beforebegin', sevDiv);
        }

        document.querySelector('#domain-table tbody').innerHTML = html;
        this.forceCloudSync();

        // Render ECharts Radar Chart
        setTimeout(() => {
            if (typeof echarts !== 'undefined' && chartData.length > 0) {
                const chartDom = document.getElementById('radar-chart');
                const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                const myChart = echarts.init(chartDom, isDarkMode ? 'dark' : 'light');
                const option = {
                    backgroundColor: 'transparent',
                    radar: {
                        indicator: chartIndicator,
                        radius: '65%',
                        splitNumber: 4,
                        axisName: { color: isDarkMode ? '#fafafa' : '#18181b', fontSize: 13, fontWeight: 'bold' }
                    },
                    series: [{
                        name: this.scaleConfig.name,
                        type: 'radar',
                        data: [{ value: chartData, name: '您的得分' }],
                        itemStyle: { color: '#8b5cf6' },
                        areaStyle: { color: 'rgba(139, 92, 246, 0.4)' },
                    }]
                };
                myChart.setOption(option);
                window.addEventListener('resize', () => { myChart.resize(); });
            }
        }, 100);
    },

    // --- 交互及杂项代码维持原样 ---
    initSwipeGesture() {
        let touchstartX = 0; let touchstartY = 0;
        const threshold = 40;
        document.addEventListener('touchstart', e => { touchstartX = e.changedTouches[0].screenX; touchstartY = e.changedTouches[0].screenY; }, { passive: true });
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
        }, { passive: true });
    },
    setupGist() {
        let oldModal = document.getElementById('gist-modal');
        if (oldModal) oldModal.remove();
        const modalHtml = `
        <div id="gist-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; display:flex; justify-content:center; align-items:center;">
            <div style="background:var(--bg-primary); border:1px solid var(--border-color); padding:25px; border-radius:16px; width:85%; max-width:400px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                <h3 style="margin-top:0; font-size:20px; color:var(--text-main);">☁️ 配置云同步</h3>
                <p style="font-size:14px; color:var(--text-muted); margin-bottom: 15px;">请输入配置以打通云端数据库：</p>
                <input type="text" id="g-id" placeholder="Gist ID" value="${this.gistConfig.id}" style="width:100%; padding:12px; margin-bottom:15px; border:1px solid var(--border-color); border-radius:8px; box-sizing:border-box; font-size:14px; background:var(--bg-secondary); color:var(--text-main);">
                <input type="text" id="g-token" placeholder="GitHub Token (ghp_...)" value="${this.gistConfig.token}" style="width:100%; padding:12px; margin-bottom:20px; border:1px solid var(--border-color); border-radius:8px; box-sizing:border-box; font-size:14px; background:var(--bg-secondary); color:var(--text-main);">
                <div style="display:flex; justify-content:flex-end; gap:12px;">
                    <button onclick="document.getElementById('gist-modal').remove()" style="padding:10px 18px; border:none; background:var(--bg-secondary); border-radius:8px; cursor:pointer; font-size:14px; color:var(--text-main);">取消</button>
                    <button onclick="const id=document.getElementById('g-id').value.trim(); const tk=document.getElementById('g-token').value.trim(); if(id&&tk){localStorage.setItem('gist_id',id); localStorage.setItem('gist_token',tk); location.reload();}else{alert('不能为空');}" style="padding:10px 18px; border:none; background:var(--purple); color:#fff; border-radius:8px; cursor:pointer; font-size:14px; font-weight:bold;">保存并刷新</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },
    
    // --- 🌟 侧边抽屉测试切换逻辑 ---
    initDrawer() {
        // 设置 Header 的当前测试名称
        const testNameEl = document.getElementById('header-test-name');
        if (testNameEl) testNameEl.innerText = this.scaleConfig.name;

        const scales = [
            { id: 'bigfive', name: '大五人格 (IPIP-NEO-300)', localKey: 'ipip_answers', color: 'rgba(139, 92, 246, 0.1)', iconColor: '#8b5cf6', icon: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>' },
            { id: 'pid5', name: 'PID-5 人格测验', localKey: 'pid5_answers', color: 'rgba(239, 68, 68, 0.1)', iconColor: '#ef4444', icon: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>' },
            { id: 'bdi2', name: '贝克抑郁量表 (BDI-II)', localKey: 'bdi2_answers', color: 'rgba(56, 189, 248, 0.1)', iconColor: '#38bdf8', icon: '<circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line>' },
            { id: 'bai', name: '贝克焦虑量表 (BAI)', localKey: 'bai_answers', color: 'rgba(245, 158, 11, 0.1)', iconColor: '#f59e0b', icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>' },
            { id: 'ysq', name: '杨氏图式 (YSQ-S3)', localKey: 'ysq_answers', color: 'rgba(16, 185, 129, 0.1)', iconColor: '#10b981', icon: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>' }
        ];

        const listContainer = document.getElementById('drawer-scale-list');
        if (!listContainer) return;
        
        let html = '';
        scales.forEach(s => {
            const isActive = this.scaleConfig.id === s.id;
            
            // 读取其他测试的进度
            let progText = '';
            if (isActive) {
                const answered = Object.keys(this.answers).filter(k => this.answers[k] !== 'skip' && !k.endsWith('_label')).length;
                progText = answered > 0 ? `<span class="drawer-item-badge">已答 ${answered}题</span>` : '';
            } else {
                try {
                    const loc = JSON.parse(localStorage.getItem(s.localKey));
                    if (loc && loc.answers) {
                        const ansArr = Object.keys(loc.answers).filter(k => loc.answers[k] !== 'skip' && !k.endsWith('_label'));
                        if (ansArr.length > 0) progText = `<span class="drawer-item-badge" style="background:#e4e4e7; color:#52525b;">已答 ${ansArr.length}题</span>`;
                    }
                } catch(e) {}
            }

            html += `
            <button class="drawer-item ${isActive ? 'active' : ''}" onclick="app.switchTest('${s.id}')">
                <div class="drawer-item-icon" style="background:${isActive ? s.color : 'rgba(0,0,0,0.05)'}; color:${isActive ? s.iconColor : 'var(--text-muted)'};">
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        ${s.icon}
                    </svg>
                </div>
                <div class="drawer-item-info">
                    <span class="drawer-item-name">${s.name}</span>
                </div>
                ${progText}
            </button>`;
        });
        listContainer.innerHTML = html;
    },

    openDrawer() {
        document.getElementById('test-drawer').classList.add('open');
        document.getElementById('drawer-overlay').classList.add('open');
    },

    closeDrawer() {
        document.getElementById('test-drawer').classList.remove('open');
        document.getElementById('drawer-overlay').classList.remove('open');
    },

    switchTest(targetScaleId) {
        if (targetScaleId === this.scaleConfig.id) {
            this.closeDrawer();
            return;
        }
        
        // 自动保存当前进度
        this.saveLocalData();
        
        // 如果有云端配置，强制推送一次同步
        if (this.gistConfig.id && this.gistConfig.token) {
            this.forceCloudSync();
        }

        // 切换页面
        window.location.href = `test.html?scale=${targetScaleId}&key=${localStorage.getItem('access_key')}`;
    },

    initProgressBar() {
        let html = '';
        for (let i = 0; i < this.questions.length; i++) html += `<div class="prog-seg" id="seg-${this.questions[i].Number}"></div>`;
        document.getElementById('progress-bar').innerHTML = html;
    },
    renderQuestion() {
        if (!this.questions || this.questions.length === 0) return;
        if (this.currentIndex >= this.questions.length) return this.showResults();
        const q = this.questions[this.currentIndex];
        if (!q || !q.Item) return;

        const currentAnswer = this.answers[q.Number];
        // currentAnswerLabel is stored for BDI-II duplicate-value options
        const currentAnswerLabel = this.answers[`${q.Number}_label`];

        const halfOptions = this.scaleConfig.halfSteps || [];
        let optionsHtml = '';
        if (q.options && q.options.length > 0) {
            optionsHtml = `<div class="row-list" style="display: flex; flex-direction: column; gap: 8px;">
                ${q.options.map((opt, idx) => {
                const optKey = `${opt.value}_${idx}`;
                const isSelected = (currentAnswer === opt.value && currentAnswerLabel === optKey);
                return `<div class="opt-btn ${isSelected ? 'selected' : ''}" style="text-align: left; padding: 10px 16px; border-radius: 10px; margin: 0; display: flex; flex-direction: row; align-items: center; justify-content: flex-start; height: auto;" onclick="app.selectOptionWithLabel(${q.Number}, ${opt.value}, '${optKey}', this)">
                        <span style="font-weight: bold; margin-right: 15px; background: rgba(139, 92, 246, 0.2); color: #a78bfa; padding: 4px 10px; border-radius: 6px; min-width: 25px; text-align: center;">${opt.value}</span> 
                        <span class="label" style="font-size: 15px; color: var(--text-primary); margin: 0; white-space: normal;">${opt.label}</span>
                    </div>`;
            }).join('')}
            </div>`;
        } else {
            let intOptions = [];
            let labels = {};
            if (this.scaleConfig.scoreMode === '0-3') {
                intOptions = [0, 1, 2, 3];
                if (this.scaleConfig.id === 'bai') {
                    labels = { 0: '无', 1: '轻度', 2: '中度', 3: '重度' };
                } else {
                    labels = { 0: '非常不符合', 1: '有点不符合', 2: '有点符合', 3: '非常符合' };
                }
            } else if (this.scaleConfig.scoreMode === '1-6') {
                intOptions = [1, 2, 3, 4, 5, 6];
                labels = { 1: '完全不符合', 2: '大部分不符合', 3: '稍微符合', 4: '中度符合', 5: '大部分符合', 6: '完美描述' };
            } else {
                intOptions = [1, 2, 3, 4, 5];
                labels = { 1: '非常不同意', 2: '不同意', 3: '一般/不确定', 4: '同意', 5: '非常同意' };
            }
            optionsHtml = `<div class="row-int">
                    ${intOptions.map(v => `<div class="opt-btn ${currentAnswer === v ? 'selected' : ''}" onclick="app.selectOption(${q.Number}, ${v}, this)">${v} <span class="label">${labels[v]}</span></div>`).join('')}
                </div>
                ${halfOptions.length > 0 ? `<div class="row-half">
                    ${halfOptions.map(v => `<div class="opt-btn ${currentAnswer === v ? 'selected' : ''}" onclick="app.selectOption(${q.Number}, ${v}, this)" style="padding: 12px 0;">${v}</div>`).join('')}
                </div>` : ''}`;
        }

        const rawAnchor = (q.Anchor || '').replace(/\\n/g, '\n').replace(/•/g, '\n•');
        const parsedAnchor = rawAnchor.split('\n').map(line => {
            line = line.trim();
            if (!line) return '';
            if (line.startsWith('•')) {
                return `<div style="display: flex; align-items: flex-start; margin-bottom: 12px;">
                            <span style="color: #8c9eff; margin-right: 12px; font-weight: bold; font-size: 18px; line-height: 1.6;">•</span>
                            <span style="flex: 1; line-height: 1.6; color: var(--text-main); text-align: justify;">${line.substring(1).trim()}</span>
                        </div>`;
            }
            return `<div style="margin-bottom: 8px; line-height: 1.6; color: var(--text-muted);">${line}</div>`;
        }).join('');

        // Facet hint for PID-5
        const facetHintHtml = q.FacetHint
            ? `<div style="font-size:12px; color:#a78bfa; margin-bottom: 6px;">分面：${q.Facet} · ${q.FacetHint}</div>`
            : '';

        const hasDoubt = this.doubts[q.Number] !== undefined;
        const doubtText = hasDoubt ? this.doubts[q.Number] : '';

        let html = `
            <div class="q-number">题目 ${this.currentIndex + 1} / ${this.questions.length}</div>
            ${facetHintHtml}
            <div class="q-title">${q.Item}</div>
            <div class="q-anchor">${parsedAnchor}</div>
            <div class="options-area">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                    <button class="doubt-toggle ${hasDoubt ? 'active' : ''}" onclick="app.toggleDoubt(${q.Number})">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        ${hasDoubt ? '取消疑问' : '添加疑问'}
                    </button>
                    ${hasDoubt ? `<input type="text" id="doubt-input-${q.Number}" class="apple-input" placeholder="具体是哪里有疑问？" value="${doubtText}" onblur="app.saveDoubt(${q.Number}, this.value)" style="flex: 1;">` : ''}
                </div>
                ${optionsHtml}
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
        // NOTE: must use !== undefined and !== 'skip' to correctly handle answer=0 for PID-5 scale
        if (currentAnswer !== undefined && currentAnswer !== 'skip') {
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
        // NOTE: value===0 is valid for PID-5. Use !== undefined instead of truthy check.
        this.updateProgress(); this.triggerCloudSave(); setTimeout(() => this.goNext(), 300);
    },
    // BDI-II specific: supports duplicate-value options (e.g. two options both valued 1)
    selectOptionWithLabel(qNumber, value, optKey, element) {
        const isSameSelection = (this.answers[qNumber] === value && this.answers[`${qNumber}_label`] === optKey);
        if (isSameSelection) {
            delete this.answers[qNumber];
            delete this.answers[`${qNumber}_label`];
            element.classList.remove('selected');
            this.saveLocalData(); this.updateProgress(); this.triggerCloudSave(); this.renderQuestion(); return;
        }
        this.answers[qNumber] = value;
        this.answers[`${qNumber}_label`] = optKey;
        this.saveLocalData();
        document.querySelectorAll('.opt-btn').forEach(btn => btn.classList.remove('selected'));
        element.classList.add('selected');
        this.updateProgress(); this.triggerCloudSave(); setTimeout(() => this.goNext(), 300);
    },
    skipQuestion() { this.answers[this.questions[this.currentIndex].Number] = 'skip'; this.saveLocalData(); this.triggerCloudSave(); this.goNext(); },
    goPrev() { if (this.currentIndex > 0) { this.currentIndex--; this.slideDirection = 'right'; this.renderQuestion(); } },
    goNext() { this.currentIndex++; this.slideDirection = 'left'; if (this.currentIndex >= this.questions.length) this.showResults(); else this.renderQuestion(); },
    updateProgress() {
        let answeredCount = 0;
        this.questions.forEach(q => {
            const seg = document.getElementById(`seg-${q.Number}`);
            if (!seg) return;
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