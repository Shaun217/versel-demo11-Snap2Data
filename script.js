let currentBase64 = null;
let currentMimeType = null;
let rawCSV = ""; // 存储原始 CSV 数据

// --- 1. 文件与粘贴处理 ---
document.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            handleFile(item.getAsFile());
        }
    }
});

function handleFile(input) {
    const file = input instanceof Event ? input.target.files[0] : input;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const raw = e.target.result;
        currentBase64 = raw.split(',')[1];
        currentMimeType = raw.split(';')[0].split(':')[1];

        // 显示预览
        document.getElementById('previewImg').src = raw;
        document.getElementById('previewImg').classList.remove('hidden');
        document.getElementById('emptyState').classList.add('hidden');
        
        // 激活提取按钮
        document.getElementById('extractBtn').disabled = false;
    };
    reader.readAsDataURL(file);
}

// --- ✨ 新增：自动获取可用模型 (核心修复) ---
async function getValidModel(apiKey) {
    try {
        // 请求模型列表
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        
        if (!data.models) {
            console.warn("无法获取模型列表，尝试使用默认值");
            return "gemini-1.5-flash-latest"; 
        }

        // 策略：优先找 'flash'，找不到就找 'pro'
        const models = data.models.map(m => m.name.replace('models/', ''));
        
        // 1. 优先匹配 1.5 flash
        let bestModel = models.find(m => m.includes('gemini-1.5-flash'));
        // 2. 其次匹配 1.5 pro
        if (!bestModel) bestModel = models.find(m => m.includes('gemini-1.5-pro'));
        // 3. 实在不行随便拿个带 gemini 的
        if (!bestModel) bestModel = models.find(m => m.includes('gemini'));

        console.log("自动选择的最佳模型:", bestModel);
        return bestModel || "gemini-1.5-flash-latest"; 

    } catch (e) {
        console.warn("自动获取模型失败，使用保底值:", e);
        return "gemini-1.5-flash-latest"; // 保底方案
    }
}

// --- 2. AI 提取逻辑 ---
async function startExtraction() {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) return alert("请先输入 API Key");

    const btn = document.getElementById('extractBtn');
    const spinner = document.getElementById('loadingSpinner');
    const placeholder = document.getElementById('placeholderText');
    
    btn.disabled = true;
    spinner.classList.remove('hidden');
    placeholder.innerText = "🔍 正在寻找最佳 AI 模型...";

    try {
        // 1. 动态获取模型名称
        const modelName = await getValidModel(apiKey);
        placeholder.innerText = `⚡ 正在使用 ${modelName} 读取表格...`;

        const prompt = `
        Task: Extract data from this image into clean CSV format.
        Rules:
        1. Output ONLY the CSV data. No markdown, no explanations.
        2. Use comma (,) delimiter.
        3. Handle merged cells by duplicating values.
        4. If no table found, return "ERROR".
        `;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: currentMimeType, data: currentBase64 } }
                    ]
                }]
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        if (!data.candidates || !data.candidates[0].content) {
            throw new Error("AI 没有返回内容，可能是图片太模糊或包含敏感信息。");
        }

        const text = data.candidates[0].content.parts[0].text;
        // 清洗数据
        rawCSV = text.replace(/```csv|```/g, "").trim();
        
        // 更新所有视图
        updateAllViews();
        
        // 默认切到表格视图
        switchTab('table');
        placeholder.classList.add('hidden');

    } catch (error) {
        alert("提取失败: " + error.message);
        placeholder.innerText = "❌ 出错了，请重试";
    } finally {
        btn.disabled = false;
        spinner.classList.add('hidden');
    }
}

// --- 3. 多格式转换与渲染 ---
function updateAllViews() {
    renderTable(rawCSV);
    document.getElementById('view-csv').value = rawCSV;
    document.getElementById('view-json').value = JSON.stringify(csvToJson(rawCSV), null, 2);
    document.getElementById('view-md').value = csvToMarkdown(rawCSV);
}

function renderTable(csv) {
    const rows = csv.split('\n');
    let html = '<table>';
    rows.forEach((row, i) => {
        html += '<tr>';
        // 简单处理逗号分隔
        row.split(',').forEach(cell => {
            const tag = i === 0 ? 'th' : 'td';
            html += `<${tag}>${cell.trim()}</${tag}>`;
        });
        html += '</tr>';
    });
    html += '</table>';
    document.getElementById('view-table').innerHTML = html;
}

function csvToJson(csv) {
    const lines = csv.split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const data = line.split(',');
        return headers.reduce((obj, nextKey, index) => {
            obj[nextKey] = data[index]?.trim();
            return obj;
        }, {});
    });
}

function csvToMarkdown(csv) {
    const rows = csv.split('\n').map(r => r.split(',').map(c => c.trim()));
    if (rows.length === 0) return "";
    const header = `| ${rows[0].join(' | ')} |`;
    const separator = `| ${rows[0].map(() => '---').join(' | ')} |`;
    const body = rows.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n');
    return `${header}\n${separator}\n${body}`;
}

// --- 4. 界面交互 ---
let currentFormat = 'table';

function switchTab(format) {
    currentFormat = format;
    document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
    // 简单的事件代理查找
    const tabs = document.querySelectorAll('.tab');
    if(format === 'table') tabs[0].classList.add('active');
    if(format === 'csv') tabs[1].classList.add('active');
    if(format === 'json') tabs[2].classList.add('active');
    if(format === 'md') tabs[3].classList.add('active');
    
    document.querySelectorAll('.view-box').forEach(div => div.classList.add('hidden'));
    document.getElementById(`view-${format}`).classList.remove('hidden');
}

function copyCurrentContent() {
    if (!rawCSV) return alert("暂无内容");
    let content = "";
    if (currentFormat === 'table' || currentFormat === 'csv') content = rawCSV;
    else if (currentFormat === 'json') content = document.getElementById('view-json').value;
    else if (currentFormat === 'md') content = document.getElementById('view-md').value;

    navigator.clipboard.writeText(content).then(() => {
        const btn = document.querySelector('.primary-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="material-icons-round">check</span> 已复制';
        setTimeout(() => btn.innerHTML = originalText, 2000);
    });
}

function downloadFile() {
    if (!rawCSV) return;
    let content = "", ext = "", type = "";
    
    if (currentFormat === 'json') {
        content = document.getElementById('view-json').value;
        ext = "json";
        type = "application/json";
    } else if (currentFormat === 'md') {
        content = document.getElementById('view-md').value;
        ext = "md";
        type = "text/markdown";
    } else {
        content = "\uFEFF" + rawCSV; 
        ext = "csv";
        type = "text/csv";
    }

    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extracted_data.${ext}`;
    a.click();
}

function saveKey() {
    const key = document.getElementById('apiKey').value;
    if (key) {
        localStorage.setItem('gemini_key', key);
        alert("Key 已保存");
    }
}

window.onload = () => {
    const savedKey = localStorage.getItem('gemini_key');
    if (savedKey) document.getElementById('apiKey').value = savedKey;
}