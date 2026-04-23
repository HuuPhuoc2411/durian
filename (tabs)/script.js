// Khởi tạo mảng lưu trữ nếu chưa có
window.__loggedFeatures = window.__loggedFeatures || [];

function createPanel() {
    if (document.getElementById('onnx-features-panel')) return;
    const p = document.createElement('div');
    p.id = 'onnx-features-panel';
    p.textContent = 'Waiting for feature extraction...';
    document.body.appendChild(p);
}

function updatePanel() {
    const p = document.getElementById('onnx-features-panel');
    const dataArray = window.__loggedFeatures;

    if (!p || dataArray.length === 0) return;

    const lastEntry = dataArray[dataArray.length - 1];
    const features = lastEntry.features;

    if (!features || !Array.isArray(features)) return;

    // Cập nhật trạng thái
    document.getElementById('status').textContent = "Đã nhận " + features.length + " features";

    let html = `
        <div class="feature-header">FEATURES SENT TO MODEL (${features.length})</div>
        <div style="color:#F57F17; font-size:10px; margin-bottom:8px">
            Time: ${lastEntry.time ? lastEntry.time.split('T')[1].split('.')[0] : 'N/A'}
        </div>
        <table class="feature-table">
    `;

    features.forEach((v, i) => {
        let label = '';
        if (i === 0) label = '[00] peak';
        else if (i === 1) label = '[01] centroid';
        else if (i >= 2 && i <= 14) label = `[${i.toString().padStart(2, '0')}] mfcc_mean[${i - 2}]`;
        else label = `[${i.toString().padStart(2, '0')}] mfcc_std[${i - 15}]`;

        html += `
            <tr>
                <td><strong>${label}</strong></td>
                <td class="feature-val">${v.toFixed(6)}</td>
            </tr>
        `;
    });

    html += '</table>';
    p.innerHTML = html;
}

// Khởi chạy
createPanel();
setInterval(updatePanel, 200);

// Mẹo: Để test thử, bạn có thể copy dòng dưới dán vào Console:
// window.__loggedFeatures.push({time: new Date().toISOString(), features: Array(28).fill(0).map(()=>Math.random())});