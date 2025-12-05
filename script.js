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

// --- 2. AI 提取逻辑 ---
async function startExtraction() {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) return alert("请先输入 API Key");

    const btn = document.getElementById('extractBtn');
    const spinner = document.getElementById('loadingSpinner');
    
    btn.disabled = true;
    spinner.classList.remove('hidden');
    document.getElementById('placeholderText').innerText = "AI 正在识别表格结构，请稍候...";

    try {
        const prompt = `
        Task: Extract data from this image into clean CSV format.
        Rules:
        1. Output ONLY the CSV data. No markdown, no explanations.
        2. Use comma (,) delimiter.
        3. Handle merged cells by duplicating values.
        4. If no table found, return "ERROR".
        `;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
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

        const text = data.candidates[0].content.parts[0].text;
        // 清洗数据
        rawCSV = text.replace(/```csv|```/g, "").trim();
        
        // 更新所有视图
        updateAllViews();
        
        // 默认切到表格视图
        switchTab('table');
        document.getElementById('placeholderText').classList.add('hidden');

    } catch (error) {
        alert("提取失败: " + error.message);
    } finally {
        btn.disabled = false;
        spinner.classList.add('hidden');
    }
}

// --- 3. 多格式转换与渲染 ---
function updateAllViews() {
    // 1. 渲染表格
    renderTable(rawCSV);
    // 2. 渲染 CSV 源码
    document.getElementById('view-csv').value = rawCSV;
    // 3. 渲染 JSON
    document.getElementById('view-json').value = JSON.stringify(csvToJson(rawCSV), null, 2);
    // 4. 渲染 Markdown
    document.getElementById('view-md').value = csvToMarkdown(rawCSV);
}

function renderTable(csv) {
    const rows = csv.split('\n');
    let html = '<table>';
    rows.forEach((row, i) => {
        html += '<tr>';
        // 简单处理逗号分隔 (生产环境建议用 PapaParse 库)
        row.split(',').forEach(cell => {
            const tag = i === 0 ? 'th' : 'td';
            html += `<${tag}>${cell.trim()}</${tag}>`;
        });
        html += '</tr>';
    });
    html += '</table>';
    document.getElementById('view-table').innerHTML = html;
}

// 工具：CSV 转 JSON
function csvToJson(csv) {
    const lines = csv.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const data = line.split(',');
        return headers.reduce((obj, nextKey, index) => {
            obj[nextKey] = data[index]?.trim();
            return obj;
        }, {});
    });
}

// 工具：CSV 转 Markdown
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
    // 切换按钮样式
    document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // 切换内容显示
    document.querySelectorAll('.view-box').forEach(div => div.classList.add('hidden'));
    document.getElementById(`view-${format}`).classList.remove('hidden');
}

function copyCurrentContent() {
    if (!rawCSV) return alert("暂无内容");
    
    let content = "";
    if (currentFormat === 'table' || currentFormat === 'csv') content = rawCSV;
    else if (currentFormat === 'json') content = document.getElementById('view-json').value;
    else if (currentFormat === 'md') content = document.getElementById('view-md').value;

    navigator.clipboard.writeText(content).then(() => alert("已复制到剪贴板！"));
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
        content = "\uFEFF" + rawCSV; // 加 BOM 防止 Excel 乱码
        ext = "csv";
        type = "text/csv";
    }

    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data.${ext}`;
    a.click();
}

// 本地存储 Key
function saveKey() {
    const key = document.getElementById('apiKey').value;
    if(key) {
        localStorage.setItem('gemini_key', key);
        alert("Key 已保存");
    }
}

window.onload = () => {
    const savedKey = localStorage.getItem('gemini_key');
    if(savedKey) document.getElementById('apiKey').value = savedKey;
}