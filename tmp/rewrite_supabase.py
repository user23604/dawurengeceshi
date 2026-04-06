import os
import re

supabase_cdn = """<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
"""
supabase_init = """<script>
    window.supabaseUrl = 'https://dxhxwznuodztyduuidpl.supabase.co';
    window.supabaseKey = 'sb_publishable_CAbUYjasJzz_ZUpnYkNJhg_ctlNwaHh';
    window.supabase = window.supabase.createClient(window.supabaseUrl, window.supabaseKey);
</script>
"""

def patch_test_html():
    path = r"d:\Desktop\vscode-project\大五人格测试网站\dawurengeceshi-main\test.html"
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Insert CDN and Init before </head>
    if "supabase-js" not in content:
        content = content.replace("</head>", supabase_cdn + supabase_init + "</head>")

    # Remove Github Cloud Gist button
    content = re.sub(
        r'<button class="icon-btn action-btn cloud-btn" onclick="app\.setupGist\(\)".*?</button>', 
        '', 
        content, 
        flags=re.DOTALL
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def patch_index_html():
    path = r"d:\Desktop\vscode-project\大五人格测试网站\dawurengeceshi-main\index.html"
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Insert CDN and Init before </head>
    if "supabase-js" not in content:
        content = content.replace("</head>", supabase_cdn + supabase_init + "</head>")

    # Replace JS block
    start_tag = "// ======= App Logic ======="
    end_tag = "        function renderAdminFeedbacks() {"
    
    new_js = """// ======= App Logic =======
        const ADMIN_KEY = '11115555';
        
        function toggleSidebar() { document.body.classList.toggle('sidebar-open'); }
        
        function switchView(viewId) {
            document.getElementById('home-view').style.display = 'none';
            document.getElementById('user-manage-view').style.display = 'none';
            document.getElementById('user-detail-view').style.display = 'none';
            document.getElementById(viewId).style.display = 'block';
            
            if (viewId === 'user-manage-view') {
                renderUserList();
            }
        }

        function openModal(id) { document.getElementById(id).style.display = 'flex'; }
        function closeModal(id) { document.getElementById(id).style.display = 'none'; }

        // == Authentication ==
        let authAttemptKey = '';

        async function tryEnter() {
            const k = document.getElementById('pwd').value.trim();
            if (!k) return;
            
            if (k === ADMIN_KEY) {
                await supabase.from('site_users').upsert({ key: k, role: 'admin', nickname: '系统管理员', added_at: Date.now() }, { onConflict: 'key' });
                localStorage.setItem('access_key', k);
                location.reload();
                return;
            }
            
            // Check Supabase directly
            const { data, error } = await supabase.from('site_users').select('*').eq('key', k).single();
            if (data) {
                if (data.nickname) {
                    localStorage.setItem('access_key', k);
                    location.reload();
                } else {
                    authAttemptKey = k;
                    document.getElementById('pwd-screen').style.display = 'none';
                    openModal('nickname-modal');
                }
            } else {
                document.getElementById('pwd-error').style.display = 'block';
                document.getElementById('pwd').value = '';
                document.getElementById('pwd').focus();
            }
        }

        async function saveNicknameAndEnter() {
            const nick = document.getElementById('nickname-input').value.trim();
            if (!nick) { alert('请输入昵称！'); return; }
            await supabase.from('site_users').update({ nickname: nick }).eq('key', authAttemptKey);
            localStorage.setItem('access_key', authAttemptKey);
            location.reload();
        }

        async function checkAccess() {
            const activeKey = localStorage.getItem('access_key');
            if (!activeKey) {
                showLogin(); return;
            }
            
            if (activeKey === ADMIN_KEY) {
                document.getElementById('nav-user-data').style.display = 'block';
                document.getElementById('admin-panel').style.display = 'block';
                renderAdminFeedbacks();
                switchView('home-view');
                return;
            }
            
            const { data } = await supabase.from('site_users').select('*').eq('key', activeKey).single();
            if (!data || !data.nickname) {
                localStorage.removeItem('access_key');
                showLogin();
            } else {
                document.getElementById('admin-panel').style.display = 'none';
                switchView('home-view');
            }
        }

        function showLogin() {
            const container = document.querySelector('.container');
            if (container) container.style.display = 'none';
            const topNav = document.querySelector('.top-nav');
            if (topNav) topNav.style.display = 'none';
            document.getElementById('pwd-screen').style.display = 'flex';
        }

        // == Admin User Management ==
        function generateRandomKey() {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let res = '';
            for(let i=0; i<8; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
            return res;
        }

        async function generateRandomUser() {
            let key = generateRandomKey();
            const { data } = await supabase.from('site_users').select('key').eq('key', key);
            if (data && data.length > 0) return generateRandomUser(); // Retry if conflict
            
            await supabase.from('site_users').insert([{ key: key, role: 'user', nickname: '', added_at: Date.now() }]);
            alert('成功生成随机密钥：' + key + '\\n（请复制给用户使用）');
            closeModal('add-user-modal');
            renderUserList();
        }

        async function addCustomUser() {
            const k = document.getElementById('custom-key-input').value.trim();
            if(k.length < 4) { alert('密钥至少4位'); return; }
            const { data } = await supabase.from('site_users').select('key').eq('key', k).single();
            if(data) { alert('该密钥已存在！'); return; }
            
            await supabase.from('site_users').insert([{ key: k, role: 'user', nickname: '', added_at: Date.now() }]);
            alert('成功添加自定义密钥：' + k);
            document.getElementById('custom-key-input').value = '';
            closeModal('add-user-modal');
            renderUserList();
        }

        async function renderUserList() {
            const query = document.getElementById('user-search').value.toLowerCase();
            const container = document.getElementById('user-list-container');
            
            container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-secondary);">🌐 从云端拉取最新数据中...</div>';
            
            const [usersRes, progressRes] = await Promise.all([
                supabase.from('site_users').select('*').order('added_at', { ascending: false }),
                supabase.from('user_progress').select('key, scale_id, answers, history')
            ]);
            
            const allUsers = usersRes.data || [];
            const allProgress = progressRes.data || [];
            
            // Map progress to keys
            const progressMap = {};
            allProgress.forEach(p => {
                if (!progressMap[p.key]) progressMap[p.key] = [];
                progressMap[p.key].push(p);
            });
            
            // Expose globally for detail view
            window.currentMemUsers = allUsers;
            window.currentMemProgress = progressMap;

            let html = '';
            
            allUsers.forEach(u => {
                const k = u.key;
                if (k === ADMIN_KEY && query === '') return;
                const nick = u.nickname || '(未设置昵称)';
                
                if (nick.toLowerCase().includes(query) || k.toLowerCase().includes(query)) {
                    // Generate progress badges
                    const pList = progressMap[k] || [];
                    let phtml = '';
                    pList.forEach(p => {
                        let answeredCount = 0;
                        if(p.answers) {
                            answeredCount = Object.keys(p.answers).filter(ak => p.answers[ak] !== 'skip' && !ak.endsWith('_label')).length;
                        }
                        if(answeredCount > 0) {
                            phtml += `<span style="display:inline-block; margin-right:10px; background:rgba(139,92,246,0.1); padding:2px 6px; border-radius:4px; font-size:0.8rem;">${p.scale_id}: ${answeredCount}题</span>`;
                        }
                    });
                    if (phtml === '') phtml = '<span style="color:var(--text-secondary); font-size:0.8rem;">暂无答题数据</span>';

                    html += `
                    <div class="user-row" onclick="viewUserDetail('${k}')">
                        <div>
                            <div class="u-nick">${nick} ${k === ADMIN_KEY ? '<span style="color:#f472b6; font-size:0.8rem;">[管理员]</span>' : ''}</div>
                            <div style="font-family:monospace; font-size:0.85rem; color:var(--text-secondary); margin-top:4px;">${k}</div>
                            <div class="u-prog">${phtml}</div>
                        </div>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                    </div>`;
                }
            });
            
            if (html === '') html = '<div style="text-align:center; padding:20px; color:var(--text-secondary);">没有找到对应用户</div>';
            container.innerHTML = html;
        }

        function viewUserDetail(k) {
            const u = window.currentMemUsers.find(x => x.key === k);
            if(!u) return;
            
            document.getElementById('detail-nickname').innerText = u.nickname || '(未设置昵称)';
            document.getElementById('detail-key').querySelector('span').innerText = k;
            
            const pList = window.currentMemProgress[k] || [];
            let phtml = '';
            let totalActivity = 0;
            pList.forEach(p => {
                let answeredCount = 0;
                let historyCount = p.history ? p.history.length : 0;
                if(p.answers) {
                    answeredCount = Object.keys(p.answers).filter(ak => p.answers[ak] !== 'skip' && !ak.endsWith('_label')).length;
                }
                if (answeredCount > 0 || historyCount > 0) {
                    totalActivity++;
                    phtml += `<div style="margin-bottom: 10px;">
                        <strong>${p.scale_id}</strong>：当前已答 ${answeredCount} 题
                        ${historyCount > 0 ? `<span style="color:#4ade80; margin-left:10px;">(历史完成 ${historyCount} 次)</span>` : ''}
                    </div>`;
                }
            });
            if(totalActivity === 0) phtml = '<div style="color:var(--text-secondary);">该用户尚未开始任何测试。</div>';
            document.getElementById('detail-progress').innerHTML = phtml;
            
            const delBtn = document.getElementById('detail-delete-btn');
            if (k === ADMIN_KEY || k === localStorage.getItem('access_key')) {
                delBtn.style.display = 'none';
            } else {
                delBtn.style.display = 'block';
                delBtn.onclick = async () => {
                    if (confirm(`警告：确定要删除用户 "${u.nickname}" 及其关联密钥吗？数据无法恢复！`)) {
                        await supabase.from('site_users').delete().eq('key', k);
                        await supabase.from('user_progress').delete().eq('key', k);
                        alert('已删除该用户');
                        switchView('user-manage-view');
                    }
                };
            }
            
            switchView('user-detail-view');
        }

"""
    idx_start = content.find(start_tag)
    idx_end = content.find(end_tag)
    if idx_start != -1 and idx_end != -1:
        content = content[:idx_start] + new_js + content[idx_end:]

    # Remove `loadCardProgress()` inner logic completely and implement it using supabase or just disable it for non-admins as they don't have cards yet.
    # Actually, cards in home view show their progress! Let's fetch it from Supabase.
    old_card_progress_logic = """                        if (localData.answers) {
                            answeredCount = Object.keys(localData.answers).filter(k => localData.answers[k] !== 'skip' && !k.endsWith('_label')).length;
                            historyCount = localData.history ? localData.history.length : 0;
                        } else {
                            // Old format fallback
                            answeredCount = Object.keys(localData).filter(k => localData[k] !== 'skip' && !k.endsWith('_label')).length;
                        }"""
    
    new_card_progress = """                        if (localData.answers) {
                            answeredCount = Object.keys(localData.answers).filter(ak => localData.answers[ak] !== 'skip' && !ak.endsWith('_label')).length;
                            historyCount = localData.history ? localData.history.length : 0;
                        }"""
    content = content.replace(old_card_progress_logic, new_card_progress)
    
    # We should replace `loadCardProgress` to use `supabase` instead of localStorage.
    card_load_start = "function loadCardProgress() {"
    card_load_end = "function submitFeedback() {"
    
    new_card_load = """async function loadCardProgress() {
            const userKey = localStorage.getItem('access_key');
            if(!userKey) return;
            const { data } = await supabase.from('user_progress').select('scale_id, answers, history').eq('key', userKey);
            if(!data) return;
            
            const progressMap = {};
            data.forEach(d => { progressMap[d.scale_id] = d; });
            
            document.querySelectorAll('.card').forEach(card => {
                const href = card.getAttribute('href');
                if (!href || !href.includes('scale=')) return;
                
                const urlParams = new URLSearchParams(href.split('?')[1]);
                const scale = urlParams.get('scale');
                const localData = progressMap[scale];
                
                if (localData) {
                    try {
                        let answeredCount = 0;
                        let historyCount = localData.history ? localData.history.length : 0;
                        if (localData.answers) {
                            answeredCount = Object.keys(localData.answers).filter(ak => localData.answers[ak] !== 'skip' && !ak.endsWith('_label')).length;
                        }
                        
                        if (answeredCount > 0 || historyCount > 0) {
                            const badgeContainer = document.createElement('div');
                            badgeContainer.className = 'card-badge-container';
                            if (historyCount > 0) badgeContainer.innerHTML += `<div class="card-badge history"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> 历史 ${historyCount} 次</div>`;
                            if (answeredCount > 0) badgeContainer.innerHTML += `<div class="card-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> 进度 ${answeredCount} 题</div>`;
                            card.appendChild(badgeContainer);
                        }
                    } catch(e) { console.error('Error loading progress for', scale, e); }
                }
            });
        }
        """
    
    idx_cs = content.find(card_load_start)
    idx_ce = content.find(card_load_end)
    if idx_cs != -1 and idx_ce != -1:
        content = content[:idx_cs] + new_card_load + content[idx_ce:]

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def patch_app_js():
    path = r"d:\Desktop\vscode-project\大五人格测试网站\dawurengeceshi-main\js\app.js"
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Remove gist references and `this.scaleConfig.localKey = ` override since we are fully on Supabase
    content = re.sub(r'this\.scaleConfig\.localKey = `\$\{this\.scaleConfig\.localKey\}_.*?;', '', content)
    
    # In `init`, replace `this.loadLocalData()` with `await this.loadSupabaseData()`
    content = content.replace(
        "this.loadLocalData();\n            if (this.gistConfig.id && this.gistConfig.token) {\n                await this.loadFromGist();\n            }",
        "await this.loadSupabaseData();"
    )

    # In `saveLocalData`, rename and refactor to `saveSupabaseData`
    # Also update calls. `saveLocalData` is scattered
    content = content.replace("this.saveLocalData();", "this.saveSupabaseData();")

    # Replace the data persistence layer block completely
    pd_start = "    // --- 数据持久化层（加入了 history） ---"
    pd_end = "    // --- 🌟 新增功能 1：归档并重测 ---"
    
    new_pd = """    // --- 最新 Supabase 数据持久化层 ---
    async loadSupabaseData() {
        if (!window.supabase) { console.error("Supabase not initialized"); return; }
        
        const statusEl = document.getElementById('sync-status');
        if (statusEl) statusEl.innerHTML = "<span style='color:#f57c00;'>⏳ 拉取云端数据...</span>";
        
        try {
            const { data, error } = await supabase.from('user_progress').select('*').eq('key', this.accessKey).eq('scale_id', this.scaleConfig.id).single();
            if (data) {
                this.answers = data.answers || {};
                this.doubts = data.doubts || {};
                this.history = data.history || [];
                // this.updateTime = data.update_time || 0;
            } else {
                this.answers = {};
                this.doubts = {};
                this.history = [];
            }
            if (statusEl) statusEl.innerHTML = "<span style='color:#4caf50;'>✅ 已同步云端进度</span>";
        } catch (err) {
            console.error("加载云端数据失败", err);
            if (statusEl) statusEl.innerHTML = "<span style='color:#d32f2f;'>❌ 获取云端数据失败</span>";
            this.answers = {}; this.doubts = {}; this.history = [];
        }
    },

    saveSupabaseData() {
        if (!window.supabase) return;
        this.updateTime = Date.now();
        this.triggerCloudSave();
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
            this.doActualCloudSave();
        } else {
            if (statusEl) statusEl.innerHTML = `<span style='color:var(--text-muted);'>💾 排队上云 (冷却中)</span>`;
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
    
    async doActualCloudSave() {
        const statusEl = document.getElementById('sync-status');
        if (statusEl) statusEl.innerHTML = "<span style='color:#f57c00;'>⏳ 正在上云...</span>";
        
        try {
            await supabase.from('user_progress').upsert({
                key: this.accessKey,
                scale_id: this.scaleConfig.id,
                answers: this.answers,
                doubts: this.doubts,
                history: this.history,
                update_time: this.updateTime
            }, { onConflict: 'key, scale_id' });
            
            if (statusEl) statusEl.innerHTML = "<span style='color:#4caf50;'>✅ 已安全上云</span>";
        } catch (e) {
            console.error(e);
            if (statusEl) statusEl.innerHTML = "<span style='color:#d32f2f;'>❌ 上传失败</span>";
        }
    },
    
    setupGist() { alert('该项目已全程接入 Supabase 进行同步，无需手动配置 Github Gist！您可以随时跨端顺畅使用。'); },

"""
    idx_ps = content.find(pd_start)
    idx_pe = content.find(pd_end)
    if idx_ps != -1 and idx_pe != -1:
        content = content[:idx_ps] + new_pd + content[idx_pe:]


    # Update exportState importState (though not used, maybe just delete them, I'll let them exist or they are in the replace string. Ah wait, they were inside the replaced block!)
    # `this.saveLocalData()` calls might be lowercased differently? No, we replaced "this.saveLocalData();" to "this.saveSupabaseData();".
    # Wait, in new_pd, I need `saveSupabaseData`. I have defined it.

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == "__main__":
    patch_test_html()
    patch_index_html()
    patch_app_js()
    print("Files patched successfully!")
