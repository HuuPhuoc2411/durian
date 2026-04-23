(function () {
  const MFCC_CHART_STATE = {
    loading: false,
    instance: null
  };

  const MFCC_FEATURE_TAP = {
    installed: false
  };

  const TXT = {
    title: ['Durian Knock Classifier', 'Phan loai tieng go sau rieng', 'Phân loại tiếng gõ sầu riêng'],
    modelLoad: ['Model load progress', 'Tien trinh tai mo hinh', 'Tiến trình tải mô hình'],
    startRec: ['Start Recording', 'Bat dau ghi am', 'Bắt đầu ghi âm'],
    downloadLast: ['Download Last Recording', 'Tai ban ghi gan nhat', 'Tải bản ghi gần nhất'],
    downloadLogs: ['Download logs', 'Tai nhat ky', 'Tải nhật ký'],
    predictions: ['Predictions', 'Ket qua du doan', 'Kết quả dự đoán'],
    charts: ['Charts', 'Bieu do', 'Biểu đồ'],
    processed: ['Processed results', 'Ket qua da xu ly', 'Kết quả đã xử lý'],
    status: ['Status:', 'Trang thai:', 'Trạng thái:']
  };

  function textOf(node) {
    return ((node && node.textContent) || '').trim();
  }

  function normalized(s) {
    return (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function isTextIn(value, aliases) {
    const t = normalized(value);
    return aliases.some((a) => t === normalized(a));
  }

  function findByText(nodes, aliases) {
    return Array.from(nodes).find((n) => isTextIn(textOf(n), aliases));
  }

  function getMainContainer() {
    return document.querySelector('#root div[style*="padding:16px;min-height:100vh"]');
  }

  function getPrimaryColumn(container) {
    return container ? container.querySelector('div[style*="max-width:640px"]') : null;
  }

  function removeStatusAndLogs(root) {
    if (!root) return;

    Array.from(root.querySelectorAll('strong'))
      .filter((s) => isTextIn(textOf(s), TXT.status))
      .forEach((s) => {
        if (s.parentElement) {
          s.parentElement.remove();
        }
      });

    Array.from(root.querySelectorAll('button'))
      .filter((b) => isTextIn(textOf(b), TXT.downloadLogs))
      .forEach((b) => b.remove());
  }

  function removeProgressCardWhenLoaded(root) {
    if (!root) return;
    const allText = textOf(root);
    const matches = Array.from(allText.matchAll(/(\d+)\s*\/\s*(\d+)\s*(models\s+loaded|mo\s+hinh\s+da\s+tai)/gi));
    const isFullyLoaded = matches.some((m) => {
      const loaded = Number(m[1]);
      const total = Number(m[2]);
      return Number.isFinite(loaded) && Number.isFinite(total) && total > 0 && loaded >= total;
    });
    if (!isFullyLoaded) return;

    const progressAnchors = Array.from(root.querySelectorAll('strong')).filter(
      (s) => isTextIn(textOf(s), TXT.modelLoad)
    );

    progressAnchors.forEach((anchor) => {
      // Remove only the visual progress block (title + bar + loaded count),
      // do not remove the container that also has recording controls.
      let target = anchor.parentElement;
      while (target && target !== root) {
        const nodeText = textOf(target);
        const hasLoadedText = /(\d+)\s*\/\s*(\d+)\s*(models\s+loaded|mo\s+hinh\s+da\s+tai)/i.test(
          normalized(nodeText)
        );
        const hasControls =
          !!target.querySelector('input[type="number"]') ||
          Array.from(target.querySelectorAll('button')).some((b) => isTextIn(textOf(b), TXT.startRec));

        if (hasLoadedText && !hasControls) {
          target.remove();
          break;
        }
        target = target.parentElement;
      }
    });

    const fallback = document.getElementById('mobile-progress-fallback');
    if (fallback) {
      fallback.remove();
    }
  }

  function getResultsCount(root) {
    if (!root) return 0;
    const text = textOf(root);
    const match = text.match(/(Results\s*\(segments\)|Ket\s*qua\s*\(doan\)):\s*(\d+)/i);
    if (!match) return 0;
    const value = Number(match[2]);
    return Number.isFinite(value) ? value : 0;
  }

  function updatePostRecordVisibility(root) {
    if (!root) return;

    const buttons = Array.from(root.querySelectorAll('button'));
    const downloadLastBtn = buttons.find((b) => isTextIn(textOf(b), TXT.downloadLast));

    const hasDownloadAvailable = !!downloadLastBtn && !downloadLastBtn.disabled;
    const resultsCount = getResultsCount(root);
    const normalizedRootText = normalized(textOf(root));
    const hasPredictionText =
      !normalizedRootText.includes('no prediction yet') &&
      !normalizedRootText.includes('chua co ket qua');
    const hasRecordOutput = hasDownloadAvailable || resultsCount > 0 || hasPredictionText;

    if (downloadLastBtn) {
      downloadLastBtn.style.display = hasRecordOutput ? '' : 'none';
    }

    const predictionsHeader = findByText(root.querySelectorAll('h3'), TXT.predictions);
    const predictionsSection = predictionsHeader ? closestCard(predictionsHeader) : null;

    const chartsHeader = findByText(root.querySelectorAll('h3'), TXT.charts);
    const chartsSection = chartsHeader && chartsHeader.parentElement ? chartsHeader.parentElement.parentElement : null;

    const processedHeader = findByText(root.querySelectorAll('h3'), TXT.processed);
    const processedSection = processedHeader ? processedHeader.parentElement : null;

    [predictionsSection, chartsSection, processedSection].forEach((section) => {
      if (!section) return;
      section.style.display = hasRecordOutput ? '' : 'none';
    });
  }

  function movePeakCentroidBeforeCharts(root) {
    if (!root) return;

    const chartsHeader = findByText(root.querySelectorAll('h3'), TXT.charts);
    const chartsSection = chartsHeader && chartsHeader.parentElement ? chartsHeader.parentElement.parentElement : null;

    const summaryId = 'ui-peak-centroid-summary';
    let summary = document.getElementById(summaryId);

    // Lấy dữ liệu từ biến global mà script này đã bắt được
    const modelData = window.__UI_MFCC_FROM_MODEL__;

    if (!summary) {
      summary = document.createElement('div');
      summary.id = summaryId;
      summary.className = 'ui-card';
      summary.style.padding = '12px';
      summary.style.marginBottom = '10px';
      summary.innerHTML =
        '<h3 style="margin:0 0 6px 0">Chi tiết 28 đặc trưng âm thanh</h3>' +
        '<div class="ui-peak-centroid-content" style="font-family: monospace; font-size: 12px; line-height: 1.6;"></div>';
    }

    if (modelData && chartsSection) {
      const content = summary.querySelector('.ui-peak-centroid-content');
      if (content) {
        // Hiển thị Peak và Centroid nổi bật
        let html = `<strong>Peak:</strong> ${modelData.peak.toFixed(2)} Hz | <strong>Centroid:</strong> ${modelData.centroid.toFixed(2)} Hz<br>`;
        html += `<div style="margin-top:8px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; border-top: 1px solid #eee; padding-top: 8px;">`;
        
        // Hiển thị 13 Mean và 13 STD (tổng 26 số MFCC)
        const fullMfcc = [...modelData.mean, ...modelData.std];
        fullMfcc.forEach((val, i) => {
          html += `<span style="color:#666;">[${i+2}]: ${val.toFixed(2)}</span>`;
        });
        
        html += `</div>`;
        content.innerHTML = html;
      }

      if (summary.parentElement !== chartsSection.parentElement) {
        chartsSection.parentElement.insertBefore(summary, chartsSection);
      }
      summary.style.display = '';
    } else {
      // Nếu chưa có dữ liệu mảng, thử dùng lại cách quét text cũ làm dự phòng
      const sourceText = textOf(root);
      const peakMatch = sourceText.match(/peak\s*:\s*([0-9.]+)/i);
      if (peakMatch && summary) {
         summary.querySelector('.ui-peak-centroid-content').textContent = "Đang chờ vector dữ liệu đầy đủ...";
         summary.style.display = '';
      }
    }
  }
  function ensureChartJsLoaded(callback, onFail) {
    if (typeof window.Chart !== 'undefined') {
      callback();
      return;
    }
    if (MFCC_CHART_STATE.loading) return;

    MFCC_CHART_STATE.loading = true;
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = function () {
      MFCC_CHART_STATE.loading = false;
      callback();
    };
    script.onerror = function () {
      MFCC_CHART_STATE.loading = false;
      if (typeof onFail === 'function') onFail();
    };
    document.head.appendChild(script);
  }

function drawRadarFallback(canvas, mean, std) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  function normalize(arr) {
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    if (max === min) return arr.map(() => 0);
    return arr.map(v => (v - min) / (max - min));
  }

  const meanN = normalize(mean);
  const stdN = normalize(std);

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 300;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 🔥 FIX QUAN TRỌNG
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fff";      // ← thêm dòng này
  ctx.fillRect(0, 0, w, h);   // ← thêm dòng này

  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.35;

  const labels = Array.from({ length: 13 }, (_, i) => `M${i + 1}`);
  const N = labels.length;

  // grid
  ctx.strokeStyle = '#ddd';
  for (let lv = 1; lv <= 5; lv++) {
    const rr = (r * lv) / 5;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // axis
  for (let i = 0; i < N; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.fillStyle = '#000';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], cx + Math.cos(ang) * (r + 12), cy + Math.sin(ang) * (r + 12));
  }

  // polygon
  function draw(data, color) {
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
      const rr = data[i] * r;
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  draw(meanN, 'red');
  draw(stdN, 'blue');
}
  function parseNumberArray(raw) {
    if (!raw) return [];
    return raw
      .replace(/[\[\](){}]/g, ' ')
      .split(/[,;\s|]+/)
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isFinite(x));
  }

  function isValidMfccPair(mean, std) {
    return Array.isArray(mean) && Array.isArray(std) && mean.length === 13 && std.length === 13;
  }

function captureMfccFromFeatureVector(vec, source) {
  if (!Array.isArray(vec) || vec.length < 28) return false;

  const safe = (arr) =>
    arr.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));

  const mean = safe(vec.slice(2, 15));
  const std = safe(vec.slice(15, 28));

  window.__UI_MFCC_FROM_MODEL__ = {
    mean,
    std,
    peak: Number(vec[0]) || 0,
    centroid: Number(vec[1]) || 0,
  };

  console.log("MFCC READY:", window.__UI_MFCC_FROM_MODEL__);

  // 🔥 FIX QUAN TRỌNG
  setTimeout(() => {
    renderMfccRadarChart(document);
  }, 100);

  return true;
}

/////////////
  function extractMfccFromModelTap() {
    const v = window.__UI_MFCC_FROM_MODEL__;
    if (!v) return null;
    if (!isValidMfccPair(v.mean, v.std)) return null;
    return { mean: v.mean, std: v.std };
  }

  function installOrtFeatureTap() {
    if (MFCC_FEATURE_TAP.installed) return;
    if (!window.ort) return;

    let installedSomething = false;

    // 1) Patch InferenceSession.run
    if (window.ort.InferenceSession && window.ort.InferenceSession.prototype) {
      const proto = window.ort.InferenceSession.prototype;
      if (!proto.__uiPatchedRun) {
        const originalRun = proto.run;
        if (typeof originalRun === 'function') {
          proto.run = async function patchedRun(feeds, fetches, options) {
            try {
              if (feeds && typeof feeds === 'object') {
                for (const key of Object.keys(feeds)) {
                  const tensor = feeds[key];
                  const data = tensor && tensor.data;
                  if (!data || typeof data.length !== 'number') continue;

                  if (data.length >= 28) {
                    const arr = Array.from(data).map(Number);
                    if (captureMfccFromFeatureVector(arr, 'onnx-feed:' + key)) {
                      break;
                    }
                  }
                }
              }
            } catch (_e) {
              // Ignore tap errors to avoid affecting model inference.
            }
            return originalRun.call(this, feeds, fetches, options);
          };

          proto.__uiPatchedRun = true;
          installedSomething = true;
        }
      } else {
        installedSomething = true;
      }
    }

    // 2) Avoid Tensor Proxy wrapping because some runtimes reject prototype swapping.
    // Keep this hook disabled to prevent cyclic __proto__ errors and UI instability.

    MFCC_FEATURE_TAP.installed = installedSomething;
  }

  function findArraysAroundKeywords(txt, meanKeyword, stdKeyword) {
    const meanRegex = new RegExp(`${meanKeyword}[^\\n:\\[]*[:=]?\\s*(\\[[^\\]]+\\]|[^\\n]+)`, 'i');
    const stdRegex = new RegExp(`${stdKeyword}[^\\n:\\[]*[:=]?\\s*(\\[[^\\]]+\\]|[^\\n]+)`, 'i');
    const meanMatch = txt.match(meanRegex);
    const stdMatch = txt.match(stdRegex);
    if (!meanMatch || !stdMatch) return null;

    const mean = parseNumberArray(meanMatch[1]);
    const std = parseNumberArray(stdMatch[1]);
    return isValidMfccPair(mean, std) ? { mean, std } : null;
  }

  function extractMfccSeriesFromWindow() {
    const visited = new WeakSet();
    const queue = [];
    const maxNodes = 1500;
    let scanned = 0;

    const roots = [window];
    roots.forEach((r) => queue.push(r));

    while (queue.length && scanned < maxNodes) {
      const node = queue.shift();
      scanned += 1;
      if (!node || (typeof node !== 'object' && typeof node !== 'function')) continue;
      if (visited.has(node)) continue;
      visited.add(node);

      let keys = [];
      try {
        keys = Object.keys(node);
      } catch (_e) {
        continue;
      }

      let mean = null;
      let std = null;

      for (const k of keys) {
        let v;
        try {
          v = node[k];
        } catch (_e) {
          continue;
        }

        if (Array.isArray(v) && v.length === 13 && v.every((n) => Number.isFinite(Number(n)))) {
          const nk = normalized(k);
          if (nk.includes('mfcc') && (nk.includes('mean') || nk.endsWith('mu'))) {
            mean = v.map((n) => Number(n));
          }
          if (nk.includes('mfcc') && (nk.includes('std') || nk.includes('sigma'))) {
            std = v.map((n) => Number(n));
          }
        }

        if (v && (typeof v === 'object' || typeof v === 'function')) {
          queue.push(v);
        }
      }

      if (isValidMfccPair(mean, std)) {
        return { mean, std };
      }
    }

    return null;
  }

  function extractMfccSeriesFromReactFiber(root) {
    if (!root) return null;

    const seen = new WeakSet();

    function tryBuild(obj) {
      if (!obj || typeof obj !== 'object') return null;
      const mean = Array.isArray(obj.mfcc_mean) ? obj.mfcc_mean.map(Number) : null;
      const std = Array.isArray(obj.mfcc_std) ? obj.mfcc_std.map(Number) : null;
      return isValidMfccPair(mean, std) ? { mean, std } : null;
    }

    function scanValue(v, depth) {
      if (!v || depth > 10) return null;
      if (typeof v !== 'object' && typeof v !== 'function') return null;
      if (seen.has(v)) return null;
      seen.add(v);

      const direct = tryBuild(v);
      if (direct) return direct;

      if (Array.isArray(v)) {
        for (const item of v) {
          const found = scanValue(item, depth + 1);
          if (found) return found;
        }
        return null;
      }

      const keys = ['memoizedProps', 'memoizedState', 'pendingProps', 'stateNode', 'child', 'sibling'];
      for (const k of keys) {
        let child;
        try {
          child = v[k];
        } catch (_e) {
          child = null;
        }
        const found = scanValue(child, depth + 1);
        if (found) return found;
      }

      // As a last resort, inspect enumerable object values.
      let vals = [];
      try {
        vals = Object.values(v);
      } catch (_e) {
        vals = [];
      }
      for (const child of vals) {
        const found = scanValue(child, depth + 1);
        if (found) return found;
      }

      return null;
    }

    // React stores fiber handle on DOM nodes under dynamic keys.
    const domNodes = [root, ...Array.from(root.querySelectorAll('*'))];
    for (const node of domNodes) {
      const ownKeys = Object.getOwnPropertyNames(node);
      const fiberKey = ownKeys.find((k) => k.startsWith('__reactFiber$'));
      if (!fiberKey) continue;
      const fiber = node[fiberKey];
      const found = scanValue(fiber, 0);
      if (found) return found;
    }

    return null;
  }

  function extractMfccSeries(root) {
    if (!root) return null;

    const fromModelTap = extractMfccFromModelTap();
    if (fromModelTap) return fromModelTap;

    const txt = textOf(root);

    const patterns = [
      {
        mean: /mfcc[_\s-]*mean[^\[]*\[([^\]]+)\]/i,
        std: /mfcc[_\s-]*std[^\[]*\[([^\]]+)\]/i
      },
      {
        mean: /"mfcc[_\s-]*mean"\s*:\s*\[([^\]]+)\]/i,
        std: /"mfcc[_\s-]*std"\s*:\s*\[([^\]]+)\]/i
      },
      {
        mean: /mean[^\[]*\[([^\]]+)\]/i,
        std: /std[^\[]*\[([^\]]+)\]/i
      },
      {
        mean: /mfccMean[^\[]*\[([^\]]+)\]/i,
        std: /mfccStd[^\[]*\[([^\]]+)\]/i
      }
    ];

    for (const p of patterns) {
      const meanMatch = txt.match(p.mean);
      const stdMatch = txt.match(p.std);
      if (!meanMatch || !stdMatch) continue;

      const mean = parseNumberArray(meanMatch[1]);
      const std = parseNumberArray(stdMatch[1]);
      if (isValidMfccPair(mean, std)) {
        return { mean, std };
      }
    }

    const keywordPairs = [
      ['mfcc[_\s-]*mean', 'mfcc[_\s-]*std'],
      ['mfccmean', 'mfccstd'],
      ['mean[_\s-]*mfcc', 'std[_\s-]*mfcc']
    ];

    for (const [mk, sk] of keywordPairs) {
      const found = findArraysAroundKeywords(txt, mk, sk);
      if (found) return found;
    }

    const fromWindow = extractMfccSeriesFromWindow();
    if (fromWindow) return fromWindow;

    const fromFiber = extractMfccSeriesFromReactFiber(root);
    if (fromFiber) return fromFiber;

    return null;
  }

function ensureMfccChartContainer(chartsSection) {
  let wrap = document.getElementById('ui-mfcc-radar-wrap');

  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'ui-mfcc-radar-wrap';

    // 🔥 FIX QUAN TRỌNG
    wrap.style.height = '400px';
    wrap.style.width = '100%';
    wrap.style.position = 'relative';

    wrap.innerHTML = `
      <h3>Biểu đồ MFCC</h3>
      <div style="height:100%; width:100%;">
        <canvas id="ui-mfcc-radar-canvas"></canvas>
      </div>
    `;

    chartsSection.appendChild(wrap);
  }

  return wrap;
}

// [CẬP NHẬT] Hàm render biểu đồ Radar tối ưu hơn

function renderMfccRadarChart(root) {
  if (!root) return;

  const chartsHeader = findByText(root.querySelectorAll('h3'), TXT.charts);
  const chartsSection = chartsHeader?.parentElement?.parentElement;
  if (!chartsSection) return;

  ensureMfccChartContainer(chartsSection);

  const canvas = document.getElementById('ui-mfcc-radar-canvas');
  if (!canvas) return;

  let modelData = window.__UI_MFCC_FROM_MODEL__;

  // 🔥 Fallback test nếu chưa có data
  if (!modelData || !modelData.mean || !modelData.std) {
    console.warn("⚠️ Không có MFCC → dùng dữ liệu test");

    modelData = {
      mean: Array.from({ length: 13 }, () => Math.random() * 20),
      std: Array.from({ length: 13 }, () => Math.random() * 10)
    };
  }

  // 🔥 đảm bảo data sạch
  const clean = (arr) =>
    arr.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));

  const mean = clean(modelData.mean).slice(0, 13);
  const std = clean(modelData.std).slice(0, 13);

  console.log("DRAW CHART:", mean, std);

  ensureChartJsLoaded(() => {
    const ctx = canvas.getContext('2d');

    // 🔥 destroy chart cũ
    if (MFCC_CHART_STATE.instance) {
      MFCC_CHART_STATE.instance.destroy();
      MFCC_CHART_STATE.instance = null;
    }

    const labels = Array.from({ length: 13 }, (_, i) => `M${i + 1}`);

    MFCC_CHART_STATE.instance = new Chart(ctx, {
      type: 'radar',
      data: {
        labels,
        datasets: [
          {
            label: 'MFCC Mean',
            data: normalize(mean),
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderColor: 'red',
            borderWidth: 2
          },
          {
            label: 'MFCC Std',
            data: std,
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderColor: 'blue',
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            beginAtZero: true,
            ticks: {
              backdropColor: 'transparent'
            }
          }
        }
      }
    });
  });
}







  function closestCard(node) {
    let cur = node;
    while (cur && cur !== document.body) {
      if (
        cur.tagName === 'DIV' &&
        ((cur.getAttribute('style') || '').includes('border-radius:10px') ||
          (cur.getAttribute('style') || '').includes('border:1px solid #eee'))
      ) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function markStableUiRoles() {
    const root = document.getElementById('root');
    if (!root) return;

    root.classList.add('ui-enhanced');

    const mainContainer = getMainContainer();
    const primaryColumn = getPrimaryColumn(mainContainer);
    if (mainContainer) mainContainer.classList.add('ui-main-container');
    if (primaryColumn) primaryColumn.classList.add('ui-primary-column');

    const title = findByText(root.querySelectorAll('h1'), TXT.title);
    if (title) title.classList.add('ui-title');

    const strongNodes = Array.from(root.querySelectorAll('strong'));
    const progressStrong = strongNodes.find((s) => isTextIn(textOf(s), TXT.modelLoad));
    const progressCard = progressStrong ? closestCard(progressStrong) : null;
    if (progressCard) progressCard.classList.add('ui-card', 'ui-card-progress');

    const startBtn = Array.from(root.querySelectorAll('button')).find((b) =>
      isTextIn(textOf(b), TXT.startRec)
    );
    const actionsGroup = startBtn ? startBtn.parentElement : null;
    const controlsRow = actionsGroup ? actionsGroup.parentElement : null;
    const durationField = controlsRow ? controlsRow.querySelector('label') : null;
    if (actionsGroup) actionsGroup.classList.add('ui-actions-group');
    if (controlsRow) controlsRow.classList.add('ui-controls-row');
    if (durationField) durationField.classList.add('ui-duration-field');

    const predictionsHeader = findByText(root.querySelectorAll('h3'), TXT.predictions);
    const predictionsCard = predictionsHeader ? closestCard(predictionsHeader) : null;
    if (predictionsCard) predictionsCard.classList.add('ui-card', 'ui-card-predictions');

    const chartsHeader = findByText(root.querySelectorAll('h3'), TXT.charts);
    const chartsRow = chartsHeader ? chartsHeader.parentElement : null;
    if (chartsRow) chartsRow.classList.add('ui-charts-row');

    const processedHeader = findByText(root.querySelectorAll('h3'), TXT.processed);
    const processedSection = processedHeader ? processedHeader.parentElement : null;
    if (processedSection) processedSection.classList.add('ui-processed-section');

    root.querySelectorAll('input[type="number"]').forEach((n) => n.classList.add('ui-input-number'));
    root.querySelectorAll('button').forEach((b) => b.classList.add('ui-btn'));

    root.querySelectorAll('button').forEach((btn) => {
      const txt = textOf(btn);
      btn.classList.remove('ui-btn-primary', 'ui-btn-secondary', 'ui-btn-logs');
      if (isTextIn(txt, TXT.startRec)) btn.classList.add('ui-btn-primary');
      if (isTextIn(txt, TXT.downloadLast)) btn.classList.add('ui-btn-secondary');
      if (isTextIn(txt, TXT.downloadLogs)) btn.classList.add('ui-btn-logs');
    });

    // Try to keep a class on runtime progress bar segments when they exist.
    root
      .querySelectorAll('div[style*="height:12px"], div[style*="height: 12px"]')
      .forEach((el) => el.classList.add('ui-progress-track'));
    root
      .querySelectorAll('div[style*="height:100%"], div[style*="height: 100%"]')
      .forEach((el) => el.classList.add('ui-progress-fill'));
  }

  function localizeUi(root) {
    if (!root) return;

    const h1 = root.querySelector('h1');
    if (h1) h1.textContent = 'Phân loại tiếng gõ sầu riêng';

    root.querySelectorAll('strong').forEach((s) => {
      if (isTextIn(textOf(s), TXT.modelLoad)) s.textContent = 'Tiến trình tải mô hình';
      if (isTextIn(textOf(s), TXT.status)) s.textContent = 'Trạng thái:';
    });

    root.querySelectorAll('h3').forEach((h) => {
      if (isTextIn(textOf(h), TXT.predictions)) h.textContent = 'Kết quả dự đoán';
      if (isTextIn(textOf(h), TXT.charts)) h.textContent = 'Biểu đồ';
      if (isTextIn(textOf(h), TXT.processed)) h.textContent = 'Kết quả đã xử lý';
    });

    root.querySelectorAll('button').forEach((btn) => {
      if (isTextIn(textOf(btn), TXT.startRec)) btn.textContent = 'Bắt đầu ghi âm';
      if (isTextIn(textOf(btn), TXT.downloadLast)) btn.textContent = 'Tải bản ghi gần nhất';
      if (isTextIn(textOf(btn), TXT.downloadLogs)) btn.textContent = 'Tải nhật ký';
    });

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let current;
    while ((current = walker.nextNode())) {
      textNodes.push(current);
    }

    textNodes.forEach((n) => {
      let v = n.nodeValue || '';
      v = v.replace(/(\d+)\s*\/\s*(\d+)\s*models\s+loaded/gi, '$1/$2 mô hình đã tải');
      v = v.replace(/Recording duration \(s\)/gi, 'Thời lượng ghi âm (giây)');
      v = v.replace(/No prediction yet\s*[—-]\s*press\s*Start Recording\s*to record and predict\./gi, 'Chưa có kết quả - nhấn Bắt đầu ghi âm để ghi và dự đoán.');
      v = v.replace(/No prediction yet\s*[—-]\s*press\s*Bat dau ghi am\s*to record and predict\./gi, 'Chưa có kết quả - nhấn Bắt đầu ghi âm để ghi và dự đoán.');
      v = v.replace(/No prediction yet\s*[—-]?\s*press\s*/gi, 'Chưa có kết quả — nhấn ');
      v = v.replace(/to record and predict\./gi, 'để ghi và dự đoán.');
      v = v.replace(
        /No prediction yet\s*[—-]\s*press\s*Start Recording\s*to record and predict\./gi,
        'Chưa có kết quả - nhấn Bắt đầu ghi âm để ghi và dự đoán.'
      );
      v = v.replace(/Results\s*\(segments\):/gi, 'Kết quả (đoạn):');
      v = v.replace(
        /Preview images are generated automatically after processing\./gi,
        'Ảnh xem trước sẽ được tạo tự động sau khi xử lý.'
      );
      v = v.replace(/Auto-loading models\.\.\./gi, 'Đang tự động tải mô hình...');
      v = v.replace(/Loaded models:/gi, 'Đã tải mô hình:');
      n.nodeValue = v;
    });

    // Normalize localized phrases to the intended Vietnamese wording.
    const accentMap = [
      ['Phan loai tieng go sau rieng', 'Phân loại tiếng gõ sầu riêng'],
      ['Tien trinh tai mo hinh', 'Tiến trình tải mô hình'],
      ['Bat dau ghi am', 'Bắt đầu ghi âm'],
      ['Tai ban ghi gan nhat', 'Tải bản ghi gần nhất'],
      ['Tai nhat ky', 'Tải nhật ký'],
      ['Ket qua du doan', 'Kết quả dự đoán'],
      ['Bieu do', 'Biểu đồ'],
      ['Ket qua da xu ly', 'Kết quả đã xử lý'],
      ['Trang thai:', 'Trạng thái:'],
      ['Thoi luong ghi am (giay)', 'Thời lượng ghi âm (giây)'],
      ['Chua co ket qua - nhan Bat dau ghi am de ghi va du doan.', 'Chưa có kết quả - nhấn Bắt đầu ghi âm để ghi và dự đoán.'],
      ['Ket qua (doan):', 'Kết quả (đoạn):'],
      ['Anh xem truoc se duoc tao tu dong sau khi xu ly.', 'Ảnh xem trước sẽ được tạo tự động sau khi xử lý.'],
      ['Dang tu dong tai mo hinh...', 'Đang tự động tải mô hình...'],
      ['Da tai mo hinh:', 'Đã tải mô hình:'],
      ['Chua co ket qua — nhan ', 'Chưa có kết quả — nhấn '],
      ['de ghi va du doan.', 'để ghi và dự đoán.']
    ];

    const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = textWalker.nextNode())) {
      let text = t.nodeValue || '';
      accentMap.forEach(([from, to]) => {
        text = text.replaceAll(from, to);
      });
      t.nodeValue = text;
    }
  }

  function localizePredictionLabels(root) {
    if (!root) return;
    const predictionsHeader = findByText(root.querySelectorAll('h3'), TXT.predictions);
    if (!predictionsHeader) return;

    const predictionsSection = closestCard(predictionsHeader) || predictionsHeader.parentElement;
    if (!predictionsSection) return;

    predictionsSection.querySelectorAll('*').forEach((el) => {
      if (el.children.length > 0) return;
      const raw = textOf(el);
      const match = raw.match(/^(1|2)\s*[—-]\s*([0-9]+(?:[.,][0-9]+)?)%$/);
      if (!match) return;

      const label = match[1] === '1' ? 'chín' : 'sống';
      const confidence = match[2].replace(',', '.');
      el.textContent = `${label} - Độ tin cậy: ${confidence}%`;
    });
  }

  function init() {
    installOrtFeatureTap();

    let scheduled = false;
    function refreshUi() {
      installOrtFeatureTap();
      localizeUi(document.getElementById('root'));
      markStableUiRoles();
      localizePredictionLabels(document.getElementById('root'));
      removeProgressCardWhenLoaded(document.getElementById('root'));
      removeStatusAndLogs(document.getElementById('root'));
      updatePostRecordVisibility(document.getElementById('root'));
      movePeakCentroidBeforeCharts(document.getElementById('root'));
      renderMfccRadarChart(document.getElementById('root'));
      scheduled = false;
    }

    function requestRefresh() {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(refreshUi);
    }

    localizeUi(document.getElementById('root'));
    markStableUiRoles();
    localizePredictionLabels(document.getElementById('root'));
    removeProgressCardWhenLoaded(document.getElementById('root'));
    removeStatusAndLogs(document.getElementById('root'));
    updatePostRecordVisibility(document.getElementById('root'));
    movePeakCentroidBeforeCharts(document.getElementById('root'));
    renderMfccRadarChart(document.getElementById('root'));

    // RN web may update progress text without adding/removing nodes.
    window.setTimeout(requestRefresh, 200);
    window.setTimeout(requestRefresh, 800);
    window.setTimeout(requestRefresh, 1500);

    const root = document.getElementById('root');
    if (!root) return;

    const observer = new MutationObserver(function () {
      requestRefresh();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

function normalize(arr) {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  if (max === min) return arr.map(() => 0);
  return arr.map(v => (v - min) / (max - min));
}