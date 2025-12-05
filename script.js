let currentCSV = ""; // 存储生成的 CSV 数据
let isProcessing = false;

// 1. 粘贴板监听 (核心功能)
document.addEventListener('paste', (event) => {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            processFile(blob);
            break;
        }
    }
});

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) processFile(file);
}

function processFile(file) {
    if (isProcessing) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const base64Data = e.target.result;
        // 显示预览
        showPreview(base64Data);
        // 开始识别
        callGemini(base64Data);
    };
    reader.readAsDataURL(file);
}

function showPreview(src) {
    const img = document.getElementById('previewImg');
    const empty = document.getElementById('emptyState');
    img.src = src;
    img.classList.remove('hidden');
    img.style.display = 'block';
    empty.style.display = 'none';
}

// 2. 调用 Gemini
async function callGemini(base64Data) {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) return alert("请先在顶部输入 API Key");

    // UI 状态
    setLoading(true);
    
    try {
        // 自动获取最佳模型 (复用之前的逻辑)
        const modelName = "gemini-1.5-flash"; 
        
        // 清洗 base64 头部
        const cleanBase64 = base64Data.split(',')[1];
        const mimeType = base64Data.split(';')[0].split(':')[1];

        // 🔥 强力 Prompt：要求纯 CSV 格式 🔥
        const prompt = `
        Task: Extract the data from this image and convert it into a CSV format.
        
        Rules:
        1. Output ONLY the CSV data. Do not include markdown code blocks (like \`\`\`csv), do not include explanations.
        2. Use comma (,) as the delimiter.
        3. If there are merged cells, duplicate the value in the corresponding cells or leave empty as appropriate for a standard CSV.
        4. If no table is found, return "ERROR: No table found".
        `;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: mimeType, data: cleanBase64 } }
                    ]
                }]
            })
        });

        const data = await response.json();
        
        if (data.error) throw new Error(data.error.message);
        if (!data.candidates) throw new Error("识别失败，请重试");

        const rawText = data.candidates[0].content.parts[0].text.trim();
        
        // 二次清洗：有时候 AI 还是会加 Markdown，手动去掉
        currentCSV = rawText.replace(/```csv|```/g, "").trim();
        
        renderTable(currentCSV);
        
    } catch (error) {
        alert("出错了: " + error.message);
    } finally {
        setLoading(false);
    }
}

// 3. 渲染表格
function renderTable(csvContent) {
    const rows = csvContent.split('\n');
    let html = '<table>';
    
    rows.forEach((row, index) => {
        // 处理 CSV 中的逗号（这里简化处理，复杂的CSV可能需要专门的库）
        const cells = row.split(','); 
        html += '<tr>';
        cells.forEach(cell => {
            // 简单的去除引号
            const cleanCell = cell.replace(/^"|"$/g, '').trim();
            if (index === 0) {
                html += `<th>${cleanCell}</th>`;
            } else {
                html += `<td>${cleanCell}</td>`;
            }
        });
        html += '</tr>';
    });
    html += '</table>';
    
    const output = document.getElementById('tableOutput');
    output.innerHTML = html;
    
    document.getElementById('resultZone').classList.remove('hidden');
}

// 4. 下载功能
function downloadCSV() {
    if (!currentCSV) return;
    const blob = new Blob([currentCSV], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "table_data.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 5. 复制功能
function copyTable() {
    if (!currentCSV) return;
    navigator.clipboard.writeText(currentCSV).then(() => {
        const btn = document.querySelector('.secondary');
        const originalText = btn.innerText;
        btn.innerText = "✅ 已复制";
        setTimeout(() => btn.innerText = originalText, 2000);
    });
}

function setLoading(isLoading) {
    isProcessing = isLoading;
    const loading = document.getElementById('loadingState');
    if (isLoading) loading.classList.remove('hidden');
    else loading.classList.add('hidden');
}

// 暂存 Key 到本地
function saveKey() {
    const key = document.getElementById('apiKey').value;
    if (key) {
        localStorage.setItem('gemini_key', key);
        alert("Key 已暂存在浏览器本地");
    }
}

// 自动加载 Key
window.onload = () => {
    const savedKey = localStorage.getItem('gemini_key');
    if (savedKey) document.getElementById('apiKey').value = savedKey;
}