let currentCSV = ""; 
let currentBase64 = null; // 暂存图片数据
let currentMimeType = null;

// 1. 粘贴事件监听
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

// 2. 处理文件：只负责预览，不调 API
function processFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const base64Data = e.target.result;
        
        // 1. 存下来
        currentBase64 = base64Data.split(',')[1];
        currentMimeType = base64Data.split(';')[0].split(':')[1];

        // 2. 显示预览图
        const img = document.getElementById('previewImg');
        const empty = document.getElementById('emptyState');
        const startBtn = document.getElementById('startBtn');
        
        img.src = base64Data;
        img.classList.remove('hidden');
        img.style.display = 'block';
        empty.style.display = 'none';
        
        // 3. 显示“开始识别”按钮
        startBtn.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

// 3. 点击按钮触发 API
async function startProcess() {
    const apiKey = document.getElementById('apiKey').value.trim();
    
    if (!apiKey) return alert("请先在顶部输入 API Key");
    if (!currentBase64) return alert("请先上传或粘贴图片");

    const loading = document.getElementById('loadingState');
    const startBtn = document.getElementById('startBtn');
    
    loading.classList.remove('hidden');
    startBtn.disabled = true;
    startBtn.innerHTML = '<span class="material-icons-round">hourglass_empty</span> 识别中...';
    
    try {
        const modelName = "gemini-1.5-flash"; 
        
        const prompt = `
        Task: Extract the data from this image and convert it into a CSV format.
        Rules:
        1. Output ONLY the CSV data. Do not include markdown code blocks (like \`\`\`csv), do not include explanations.
        2. Use comma (,) as the delimiter.
        3. If there are merged cells, duplicate the value in the corresponding cells.
        4. If the image does not contain a table, return "ERROR: No table found".
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
        if (!data.candidates) throw new Error("识别失败，请重试");

        const rawText = data.candidates[0].content.parts[0].text.trim();
        currentCSV = rawText.replace(/```csv|```/g, "").trim();
        
        renderTable(currentCSV);
        
    } catch (error) {
        alert("出错了: " + error.message);
    } finally {
        loading.classList.add('hidden');
        startBtn.disabled = false;
        startBtn.innerHTML = '<span class="material-icons-round">auto_awesome</span> 重新识别';
    }
}

function renderTable(csvContent) {
    const rows = csvContent.split('\n');
    let html = '<table>';
    
    rows.forEach((row, index) => {
        const cells = row.split(','); 
        html += '<tr>';
        cells.forEach(cell => {
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

function downloadCSV() {
    if (!currentCSV) return;
    // 添加 BOM 头防止 Excel 中文乱码
    const bom = "\uFEFF";
    const blob = new Blob([bom + currentCSV], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "table_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function copyTable() {
    if (!currentCSV) return;
    navigator.clipboard.writeText(currentCSV).then(() => {
        alert("CSV 数据已复制到剪贴板");
    });
}

function saveKey() {
    const key = document.getElementById('apiKey').value;
    if (key) {
        localStorage.setItem('gemini_key', key);
        alert("Key 已暂存");
    }
}

window.onload = () => {
    const savedKey = localStorage.getItem('gemini_key');
    if (savedKey) document.getElementById('apiKey').value = savedKey;
}