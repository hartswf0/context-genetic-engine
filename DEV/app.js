/**
 * CONTEXT GENETICS ENGINE - EXTENSION LOGIC (Manifest V3)
 * Full explicit rebuild, including URL Ingestion Engine and all event listeners.
 */

// --- DATA MODEL ---
let genome = [];
let genomeHistory = [];
let synthesisImages = [];
let taskImages = [];
let pendingExportData = null;

let chamberExpanded = false; 
let lastRawOutput = "";
let lastCompiledPrompt = "";
let isRenderView = false;

const PROMPT_LOCI = ['RSN', 'EVD', 'OUT', 'FLR', 'FIT', 'CST', 'CMT'];
const AI_BREEDER_PROMPT = `You are the CONTEXT GENETICS ENGINE. Your task is to extract or generate a structured JSON array of "prompt codons" (genes) that form a system prompt architecture.\nLOCI:\n- RSN: Reasoning Order\n- EVD: Evidence Policy\n- OUT: Output Form\n- FLR: Failure Handling\n- FIT: Fitness Pressure / Optimization target\n- CST: Custom explicit trait/constraint\nOutput purely the requested JSON structures.\nCodon Schema: { "type": "...", "payload": "specific instruction text", "state": "EXON", "weight": integer }`;

const colHelpData = {
    'palette': {
      title: "01 :: PALETTE (UPSTREAM)",
      body: `<b>PURPOSE:</b> The source material for your DNA.<br><br><b>Manual Injection:</b> Click the Loci buttons to manually add specific cognitive constraints to your genome.<br><br><b>Artificial Selection:</b> Describe what you want the system to do in the text box. Then click <b>Synthesize Genome</b> to let the engine generate a complete architectural sequence for you.<br><br><i>Use the Dihybrid Cross (Mendelian Matrix) to breed two different prompt strategies together.</i>`
    },
    'genotype': {
      title: "00 :: GENOTYPE (DNA)",
      body: `<b>PURPOSE:</b> The active architectural sequence.<br><br>These codons dictate the behavior of your system prompt. They are executed from top to bottom.<br><br>• <b>Edit:</b> Type directly into any block.<br>• <b>EXON / INTRON:</b> Toggle a block to "INTRON" (dashed) to temporarily silence it.<br>• <b>Local Mutation (MUT):</b> Use the mini-prompt under any block to target an AI mutation on just that single instruction.`
    },
    'field': {
      title: "03 :: FIELD (ENVIRONMENT)",
      body: `<b>PURPOSE:</b> The execution environment.<br><br><b>Target Task:</b> Paste the raw data, user request, or context that you want the Genotype to process. If left blank, it will automatically scrape the current browser tab.<br><br><b>Express Phenotype:</b> Compiles your Genotype into a strict system prompt, applies it to the Target Task, and generates the final Output Artifact below.`
    }
};

// --- DOM ELEMENTS ---
const els = {};

document.addEventListener('DOMContentLoaded', () => {
    els.workspace = document.getElementById('workspace');
    els.genomeContainer = document.getElementById('genome-container');
    els.genomeDots = document.getElementById('genome-dots');
    els.status = document.getElementById('storage-status');
    els.phenoOut = document.getElementById('phenotype-output');
    els.phenoText = document.getElementById('pheno-text');
    els.phenoFrame = document.getElementById('pheno-frame');
    els.phenoPrompt = document.getElementById('pheno-prompt');
    els.chamber = document.getElementById('chamber');
    els.upload = document.getElementById('import-file');
    els.colGenoBadge = document.getElementById('col-geno-badge');
    els.apiKeyInput = document.getElementById('gemini-api-key');

    setupEventListeners();
    loadFromStorage();
});

// --- EVENT DELEGATION & LISTENERS ---
function setupEventListeners() {
    // Top Bar & Buttons
    document.getElementById('btn-undo').addEventListener('click', undoState);
    document.getElementById('btn-import').addEventListener('click', () => els.upload.click());
    document.getElementById('btn-export').addEventListener('click', prepareExport);
    document.getElementById('btn-toggle-chamber').addEventListener('click', toggleChamber);
    
    // Core Actions
    document.getElementById('btn-generate').addEventListener('click', () => triggerAiOp('generate'));
    document.getElementById('btn-mutate').addEventListener('click', () => triggerAiOp('mutate'));
    document.getElementById('btn-punnett').addEventListener('click', generatePunnettSquare);
    document.getElementById('btn-stepping-stone').addEventListener('click', () => triggerAiOp('diverge'));
    document.getElementById('btn-express').addEventListener('click', expressPhenotype);
    document.getElementById('btn-purge-genome').addEventListener('click', clearGenome);

    // URL Ingestion Engine Links (Replacing inline onclick)
    const btnIngestAi = document.getElementById('btn-ingest-ai');
    if (btnIngestAi) btnIngestAi.addEventListener('click', () => ingestUrl('ai-prompt', 'url-ingest-ai-input', 'panel-upstream'));
    
    const btnIngestTask = document.getElementById('btn-ingest-task');
    if (btnIngestTask) btnIngestTask.addEventListener('click', () => ingestUrl('target-task', 'url-ingest-task-input', 'panel-phenotype'));

    // Modals & Navigation
    document.querySelectorAll('.modal-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => toggleModal(e.currentTarget.dataset.modal));
    });
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => toggleModal(e.currentTarget.dataset.modal));
    });
    document.querySelectorAll('.btn-scroll-to').forEach(btn => {
        btn.addEventListener('click', (e) => scrollToCol(e.currentTarget.dataset.target));
    });
    document.querySelectorAll('.btn-col-help').forEach(btn => {
        btn.addEventListener('click', (e) => showColHelp(e.currentTarget.dataset.col));
    });
    
    // Add Loci
    document.querySelectorAll('.btn-add-codon').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const btnEl = e.currentTarget;
            addCodon(btnEl.dataset.type, btnEl.dataset.payload);
        });
    });

    // File Uploads
    const synthUpload = document.getElementById('synthesis-img-upload');
    if (synthUpload) synthUpload.addEventListener('change', (e) => handleImageUpload(e, 'synthesis'));
    
    const taskUpload = document.getElementById('task-img-upload');
    if (taskUpload) taskUpload.addEventListener('change', (e) => handleImageUpload(e, 'task'));
    
    els.upload.addEventListener('change', importGenomeFile);
    
    // Dynamic Genome Container (Event Delegation)
    els.genomeContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const index = parseInt(btn.dataset.index);
        
        if (btn.classList.contains('op-up')) moveCodon(index, -1);
        if (btn.classList.contains('op-down')) moveCodon(index, 1);
        if (btn.classList.contains('op-toggle')) toggleState(index);
        if (btn.classList.contains('op-del')) deleteCodon(index);
        if (btn.classList.contains('op-mut')) mutateCodon(index);
        if (btn.classList.contains('op-img-kill')) {
            removeCodonImage(index, parseInt(btn.dataset.imgIndex));
        }
    });

    els.genomeContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('unit-payload')) {
            const index = parseInt(e.target.dataset.index);
            updatePayload(index, e.target.value);
            autoResize(e.target);
        }
    });
    
    els.genomeContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('codon-img-upload')) {
            handleCodonImageUpload(e, parseInt(e.target.dataset.index));
        }
    });

    // Autogrow Textareas globally
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('autogrow')) autoResize(e.target);
    });

    // Artifact tools
    const btnDlBundle = document.getElementById('btn-dl-bundle');
    if(btnDlBundle) btnDlBundle.addEventListener('click', downloadBundle);
    const btnTogglePrompt = document.getElementById('btn-toggle-prompt');
    if(btnTogglePrompt) btnTogglePrompt.addEventListener('click', togglePromptView);
    const btnToggleView = document.getElementById('btn-toggle-view');
    if(btnToggleView) btnToggleView.addEventListener('click', toggleArtifactView);
    const btnCopyArt = document.getElementById('btn-copy-artifact');
    if(btnCopyArt) btnCopyArt.addEventListener('click', copyArtifact);
    const btnDlArt = document.getElementById('btn-dl-artifact');
    if(btnDlArt) btnDlArt.addEventListener('click', downloadArtifact);
    const btnMaxArt = document.getElementById('btn-max-artifact');
    if(btnMaxArt) btnMaxArt.addEventListener('click', maximizeArtifact);
    const btnCommitExp = document.getElementById('btn-commit-export');
    if(btnCommitExp) btnCommitExp.addEventListener('click', commitExport);
    const btnSaveApiKey = document.getElementById('btn-save-api-key');
    if(btnSaveApiKey) btnSaveApiKey.addEventListener('click', saveApiKey);

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.img-remove');
        if (!btn) return;
        removeImage(btn.dataset.target, parseInt(btn.dataset.index));
    });
}

// --- LOGGING & STATE ---
function logChamber(msg, type="") {
    const div = document.createElement("div"); div.innerHTML = msg; if(type) div.className = type;
    els.chamber.appendChild(div);
    if(type === 'log-err' && !chamberExpanded) toggleChamber();
    if(chamberExpanded) els.chamber.scrollTop = els.chamber.scrollHeight;
}

function setStatus(msg, isErr=false) {
    els.status.innerHTML = msg;
    if(isErr) { els.status.classList.add('danger'); els.status.classList.remove('success'); } 
    else { els.status.classList.add('success'); els.status.classList.remove('danger'); }
}

function toggleChamber() {
    chamberExpanded = !chamberExpanded;
    const icon = document.getElementById('chamber-toggle-icon');
    if(chamberExpanded) { els.chamber.classList.remove('collapsed'); icon.innerText = "▼ HIDE"; els.chamber.scrollTop = els.chamber.scrollHeight; } 
    else { els.chamber.classList.add('collapsed'); icon.innerText = "▲ SHOW"; }
}

function saveState() {
    genomeHistory.push(JSON.parse(JSON.stringify(genome)));
    if (genomeHistory.length > 20) genomeHistory.shift(); 
    document.getElementById('btn-undo').disabled = false;
}

function undoState() {
    if (genomeHistory.length === 0) return;
    genome = genomeHistory.pop();
    if (genomeHistory.length === 0) document.getElementById('btn-undo').disabled = true;
    saveToStorage(); renderGenomeUI();
    logChamber("> [Time] Lineage reverted to previous state.", "log-err");
}

function togglePanelLoader(panelId, show, msg = "PROCESSING") {
    const panel = document.getElementById(panelId);
    if(!panel) return;
    let loader = panel.querySelector('.panel-overlay');
    if(show) {
        if(!loader) {
            loader = document.createElement('div'); loader.className = 'panel-overlay';
            loader.innerHTML = `<div class="dna-loader"><div class="dna-dot"></div><div class="dna-dot"></div><div class="dna-dot"></div></div><div class="loader-msg"></div>`;
            panel.appendChild(loader);
        }
        loader.querySelector('.loader-msg').innerText = msg; loader.style.display = 'flex';
    } else { if(loader) loader.style.display = 'none'; }
}

// --- EXTENSION COMMUNICATION & STORAGE ---
async function sendBackgroundRequest(action, payload) {
    return new Promise((resolve, reject) => {
        if (!window.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
            reject(new Error("Extension runtime unavailable. Load this folder through chrome://extensions."));
            return;
        }
        chrome.runtime.sendMessage({ action, payload }, response => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else if (!response) reject(new Error("No extension response."));
            else resolve(response);
        });
    });
}

function saveToStorage() {
    if (!window.chrome || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.set({
        'context_genome_sequence': { genome, synthesisImages, taskImages },
        'context_target_task': document.getElementById('target-task').value
    }, () => {
        setStatus("SYS: SYNCED"); setTimeout(() => setStatus("SYS: IDLE"), 2000);
        updateTelemetry();
    });
}

function loadFromStorage() {
    if (!window.chrome || !chrome.storage || !chrome.storage.local) {
        genome = [
            { id: generateId(), type: 'RSN', payload: 'Construct theory before output.', state: 'EXON', weight: 90, images: [] },
            { id: generateId(), type: 'FIT', payload: 'Optimize for conceptual compression and precision.', state: 'EXON', weight: 80, images: [] }
        ];
        renderGenomeUI();
        setStatus("SYS: EXTENSION REQUIRED", true);
        return;
    }
    chrome.storage.local.get(['context_genome_sequence', 'context_target_task', 'geminiApiKey'], (result) => {
        if (els.apiKeyInput && result.geminiApiKey) {
            els.apiKeyInput.value = result.geminiApiKey;
        }
        if (result.context_genome_sequence) {
            const parsed = result.context_genome_sequence;
            if (Array.isArray(parsed)) genome = parsed;
            else {
                genome = parsed.genome || []; synthesisImages = parsed.synthesisImages || []; taskImages = parsed.taskImages || [];
                renderImagePreviews('synthesis'); renderImagePreviews('task');
            }
            genome.forEach(c => { if(!c.images) c.images = []; });
        } else {
            genome = [
                { id: generateId(), type: 'RSN', payload: 'Construct theory before output.', state: 'EXON', weight: 90, images: [] },
                { id: generateId(), type: 'FIT', payload: 'Optimize for conceptual compression and precision.', state: 'EXON', weight: 80, images: [] }
            ];
        }
        
        if(result.context_target_task) {
            const el = document.getElementById('target-task');
            if (el) {
                el.value = result.context_target_task; 
                setTimeout(() => autoResize(el), 100);
            }
        }
        renderGenomeUI();
    });
}

function saveApiKey() {
    if (!els.apiKeyInput) return;
    if (!window.chrome || !chrome.storage || !chrome.storage.local) {
        setStatus("SYS: EXTENSION REQUIRED", true);
        return;
    }
    const key = els.apiKeyInput.value.trim();
    chrome.storage.local.set({ geminiApiKey: key }, () => {
        setStatus(key ? "SYS: API KEY SAVED" : "SYS: API KEY CLEARED");
        logChamber(key ? "> [Config] Gemini API key saved locally." : "> [Config] Gemini API key cleared.", key ? "log-succ" : "log-err");
        setTimeout(() => setStatus("SYS: IDLE"), 1800);
    });
}

// --- UNIVERSAL URL INGESTION ENGINE ---
async function ingestUrl(targetAreaId, inputAreaId, panelId) {
    const urlInput = document.getElementById(inputAreaId);
    let rawUrl = urlInput.value.trim();
    if(!rawUrl) return;

    if(!rawUrl.startsWith('http')) rawUrl = 'https://' + rawUrl;

    // Auto-convert standard GitHub UI links to raw.githubusercontent links for direct text parsing
    if(rawUrl.includes('github.com') && rawUrl.includes('/blob/')) {
        rawUrl = rawUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
    }

    setControls(true);
    togglePanelLoader(panelId, true, "ABSORBING EXTERNAL SOURCE");
    logChamber(`> [Ingest] Fetching remote context: ${rawUrl}`, `log-step`);

    try {
        const response = await sendBackgroundRequest("FETCH_URL", { url: rawUrl });
        if (!response.success) throw new Error(response.error || "Network response blocked or invalid.");
        let content = response.data.content;

        if(!content) throw new Error("Empty payload returned.");

        // Basic extraction: If payload is an HTML webpage, strip out scripts/styles/navs to save context tokens
        if(content.toLowerCase().includes('<html') || content.toLowerCase().includes('<!doctype')) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            
            const noiseElements = doc.querySelectorAll('script, style, nav, footer, header, iframe, noscript, svg');
            noiseElements.forEach(el => el.remove());
            
            // Extract readable text and collapse excessive newlines
            content = doc.body.innerText.replace(/\n\s*\n/g, '\n\n').trim();
        }

        const targetEl = document.getElementById(targetAreaId);
        const prefix = targetEl.value ? targetEl.value + `\n\n--- [ INGESTED SOURCE: ${rawUrl} ] ---\n\n` : `--- [ INGESTED SOURCE: ${rawUrl} ] ---\n\n`;
        targetEl.value = prefix + content;
        
        autoResize(targetEl);
        saveToStorage(); // Save newly injected content
        
        logChamber(`> [Ingest] Successfully absorbed into target environment.`, `log-succ`);
        urlInput.value = ''; 
    } catch(e) {
        logChamber(`> [Ingest] Failed to absorb data. ${escapeHTML(e.message || "Invalid URL.")}`, `log-err`);
    }
    
    togglePanelLoader(panelId, false);
    setControls(false);
}

// --- UI HELPERS & NAVIGATION ---
function scrollToCol(type) { requestAnimationFrame(() => document.querySelector(`[data-column="${type}"]`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })); }
function toggleModal(modalId) {
    const modal = document.getElementById(modalId);
    if(modal.classList.contains('active')) modal.classList.remove('active');
    else { document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); modal.classList.add('active'); }
}
function showColHelp(colId) {
    const data = colHelpData[colId]; if(!data) return;
    document.getElementById('col-help-title').innerHTML = data.title;
    document.getElementById('col-help-body').innerHTML = data.body;
    toggleModal('col-help-modal');
}
function autoResize(el) {
    if(el.offsetParent !== null) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, window.innerHeight * 0.3) + 'px'; }
}
function generateId() { return Math.random().toString(36).substring(2, 9); }
function escapeHTML(str) { return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])); }
function updateTelemetry() { if(els.colGenoBadge) els.colGenoBadge.innerText = String(genome.length).padStart(2, '0'); }

function setControls(disabled) { 
    ['btn-express', 'btn-generate', 'btn-mutate', 'btn-stepping-stone', 'btn-punnett', 'btn-ingest-ai', 'btn-ingest-task'].forEach(id => { 
        const el = document.getElementById(id); if(el) el.disabled = disabled; 
    }); 
}

// --- DOM MUTATION & DATA LOGIC ---
function addCodon(type, payload = '', state = 'EXON', index = -1, weight = 50) { saveState(); const newCodon = { id: generateId(), type, payload, state, weight, images: [] }; if (index === -1) genome.push(newCodon); else genome.splice(index, 0, newCodon); saveToStorage(); renderGenomeUI(); }
function deleteCodon(index) { saveState(); genome.splice(index, 1); saveToStorage(); renderGenomeUI(); }
function moveCodon(index, direction) { if (index + direction < 0 || index + direction >= genome.length) return; saveState(); const temp = genome[index]; genome[index] = genome[index + direction]; genome[index + direction] = temp; saveToStorage(); renderGenomeUI(); }
function updatePayload(index, value) { saveState(); genome[index].payload = value; saveToStorage(); }
function toggleState(index) { saveState(); genome[index].state = genome[index].state === 'EXON' ? 'INTRON' : 'EXON'; saveToStorage(); renderGenomeUI(); }
function clearGenome() { if(confirm("Purge entire prompt lineage?")) { saveState(); genome = []; saveToStorage(); renderGenomeUI(); logChamber("> [Purge] Lineage wiped.", "log-err"); } }

// --- VISION LOGIC ---
function handleImageUpload(event, target) {
    const files = Array.from(event.target.files); if (!files.length) return;
    const targetArray = target === 'synthesis' ? synthesisImages : taskImages;
    for (const file of files) {
        const reader = new FileReader();
        reader.onload = (e) => {
            targetArray.push({ mimeType: file.type, data: e.target.result.split(',')[1], dataUrl: e.target.result });
            renderImagePreviews(target); saveToStorage(); logChamber(`> [Vision] Attached reference.`, `log-succ`);
        };
        reader.readAsDataURL(file);
    }
    event.target.value = '';
}

function handleCodonImageUpload(event, index) {
    const files = Array.from(event.target.files); if (!files.length) return;
    if (!genome[index].images) genome[index].images = [];
    for (const file of files) {
        const reader = new FileReader();
        reader.onload = (e) => {
            genome[index].images.push({ mimeType: file.type, data: e.target.result.split(',')[1], dataUrl: e.target.result });
            saveToStorage(); renderGenomeUI();
        };
        reader.readAsDataURL(file);
    }
    event.target.value = '';
}

function removeImage(target, index) { const targetArray = target === 'synthesis' ? synthesisImages : taskImages; targetArray.splice(index, 1); renderImagePreviews(target); saveToStorage(); logChamber(`> [Vision] Removed reference.`, `log-err`); }
function removeCodonImage(codonIndex, imgIndex) { saveState(); genome[codonIndex].images.splice(imgIndex, 1); saveToStorage(); renderGenomeUI(); }
function renderImagePreviews(target) {
    const container = document.getElementById(`${target}-img-preview`); const targetArray = target === 'synthesis' ? synthesisImages : taskImages;
    if (!container) return;
    container.innerHTML = targetArray.map((imgObj, idx) => `
        <div class="img-thumb"><img src="${imgObj.dataUrl}"><button class="img-kill img-remove" data-target="${target}" data-index="${idx}">✕</button></div>
    `).join('');
}
function getSynthesisParts(baseText) { const parts = [{ text: baseText }]; synthesisImages.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } })); return parts; }

// --- LOCAL MUTATION TOOL ---
async function mutateCodon(index) {
    const codon = genome[index];
    const promptEl = document.getElementById(`codon-ai-${index}`);
    const directive = promptEl.value.trim();
    if(!directive && (!codon.images || codon.images.length === 0)) return;

    setControls(true); togglePanelLoader('panel-genotype', true, "MUTATING ALLELE");
    logChamber(`> [Codon ${codon.type}] Localized mutation triggered...`, `log-step`);

    const parts = [{ text: `You are mutating a specific system instruction.\nCurrent Instruction: "${codon.payload}"\nDirective: "${directive || 'Improve this instruction based on the attached context.'}"\nOutput ONLY the new, rewritten instruction text. Do not use markdown blocks.` }];
    if(codon.images && codon.images.length > 0) {
        codon.images.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } }));
    }
    const payload = { contents: [{ parts: parts }] };
    
    try {
        const response = await sendBackgroundRequest("GEMINI_API", payload);
        if (!response.success) throw new Error(response.error);
        
        let resultText = response.data.candidates[0].content.parts[0].text.trim();
        resultText = resultText.replace(/^`{3}[a-z]*\n/i, '').replace(/\n`{3}$/i, '').trim();
        
        saveState(); genome[index].payload = resultText; saveToStorage(); renderGenomeUI();
        togglePanelLoader('panel-genotype', false); logChamber(`> [Codon ${codon.type}] Mutation stabilized.`, `log-succ`);
    } catch(e) {
        togglePanelLoader('panel-genotype', false); logChamber(`> [Codon ${codon.type}] Local Mutation failed.`, `log-err`);
    }
    setControls(false);
}

// --- CORE RENDERER ---
function renderGenomeUI() {
    if(!els.genomeContainer) return;
    els.genomeContainer.innerHTML = ''; els.genomeDots.innerHTML = ''; 
    genome.forEach((codon, index) => {
        const isIntron = codon.state === 'INTRON';
        const dot = document.createElement('button'); dot.className = `beat-pill ${isIntron ? 'intron' : ''}`; dot.innerText = codon.type;
        dot.addEventListener('click', () => { scrollToCol('genotype'); setTimeout(() => document.getElementById(`codon-${codon.id}`)?.scrollIntoView({behavior: "smooth", block: "center"}), 300); });
        els.genomeDots.appendChild(dot);

        let imagesHtml = '';
        if (codon.images && codon.images.length > 0) {
            imagesHtml = `<div class="img-preview-rail codon-image-rail">` + 
                codon.images.map((img, imgIdx) => `<div class="img-thumb"><img src="${img.dataUrl}"><button class="img-kill op-img-kill" data-index="${index}" data-img-index="${imgIdx}">✕</button></div>`).join('') + `</div>`;
        }

        let locusClass = `locus-generic`;
        if(codon.type === 'RSN') locusClass = 'locus-rsn';
        if(codon.type === 'EVD') locusClass = 'locus-evd';
        if(codon.type === 'FLR') locusClass = 'locus-flr';
        if(codon.type === 'FIT') locusClass = 'locus-fit';

        const card = document.createElement('div'); card.className = `slot-row`; card.id = `codon-${codon.id}`;
        card.innerHTML = `
            <div class="slot-num">${String(index).padStart(2, '0')}</div>
            <article class="unit ${isIntron ? 'intron' : ''}">
                <div class="unit-header">
                    <span class="unit-id ${locusClass}">${escapeHTML(codon.type)}</span>
                    <div class="unit-ops">
                        <button data-index="${index}" class="mini op-up">▲</button>
                        <button data-index="${index}" class="mini op-down">▼</button>
                        <button data-index="${index}" class="mini op-toggle ${!isIntron ? 'active' : ''}">${codon.state}</button>
                        <button data-index="${index}" class="mini danger op-del">✕</button>
                    </div>
                </div>
                <textarea data-index="${index}" class="unit-payload autogrow" placeholder="Allele instructions...">${escapeHTML(codon.payload)}</textarea>
                <div class="codon-tools">
                    ${imagesHtml}
                    <div class="codon-tools-row">
                        <input type="text" id="codon-ai-${index}" class="codon-ai-input" placeholder="Prompt specific mutation...">
                        <label class="mini codon-img-label">+ IMG
                            <input type="file" accept="image/*" multiple class="codon-img-upload is-hidden" data-index="${index}">
                        </label>
                        <button data-index="${index}" class="mini action op-mut">MUT</button>
                    </div>
                </div>
            </article>`;
        els.genomeContainer.appendChild(card);
    });
    setTimeout(() => { els.genomeContainer.querySelectorAll('.autogrow').forEach(autoResize); }, 10);
    updateTelemetry();
}

// --- IMPORT / EXPORT & ARTIFACT TOOLS ---
function prepareExport() {
    pendingExportData = {
        version: "5.1", timestamp: Date.now(), genome,
        environment: { targetTask: document.getElementById('target-task').value, aiPrompt: document.getElementById('ai-prompt').value },
        vision: { synthesisImages, taskImages }
    };
    const seqEl = document.getElementById('export-genome-preview');
    seqEl.innerHTML = genome.map(g => `<span class="${g.state === 'EXON' ? 'export-exon' : 'export-intron'}">[${escapeHTML(g.type)}]</span> ${escapeHTML(g.payload)}`).join('\n\n');
    const envEl = document.getElementById('export-env-preview');
    envEl.innerHTML = `[ AI SYNTHESIS DIRECTIVE ]\n${escapeHTML(pendingExportData.environment.aiPrompt || 'N/A')}\n\n[ TARGET TASK CONTEXT ]\n${escapeHTML(pendingExportData.environment.targetTask || 'N/A')}\n\n[ VISION STATE ]\nSynthesis Attachments: ${synthesisImages.length}\nTask Attachments: ${taskImages.length}`;
    document.getElementById('inspect-json').value = JSON.stringify(pendingExportData, null, 2);
    toggleModal('inspect-modal');
}

function commitExport() {
    if(!pendingExportData) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pendingExportData, null, 2));
    const a = document.createElement('a'); a.href = dataStr; a.download = "genoma_ecology_" + Date.now() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    toggleModal('inspect-modal'); 
}

function importGenomeFile(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result); saveState();
            if (Array.isArray(imported)) {
                genome = imported.map(c => ({ id: generateId(), type: c.type || 'CST', payload: c.payload || '', state: c.state === 'INTRON' ? 'INTRON' : 'EXON', weight: c.weight || 50, images: c.images || [] }));
            } else if (imported.genome) {
                genome = imported.genome.map(c => ({...c, id: c.id || generateId(), images: c.images || []}));
                if(imported.environment) {
                    if(imported.environment.targetTask) document.getElementById('target-task').value = imported.environment.targetTask;
                    if(imported.environment.aiPrompt) document.getElementById('ai-prompt').value = imported.environment.aiPrompt;
                }
                if(imported.vision) {
                    synthesisImages = imported.vision.synthesisImages || []; taskImages = imported.vision.taskImages || [];
                    renderImagePreviews('synthesis'); renderImagePreviews('task');
                }
                setTimeout(() => { autoResize(document.getElementById('target-task')); autoResize(document.getElementById('ai-prompt')); }, 100);
            }
            saveToStorage(); renderGenomeUI(); logChamber("> [Import] Ecology restored.", "log-succ"); scrollToCol('genotype');
        } catch (err) { alert("Invalid JSON"); }
    };
    reader.readAsText(file);
}

function extractArtifactHTML(text) {
    const rgx = new RegExp('`{3}(?:html|javascript|js|css)?\\n([\\s\\S]*?)`{3}', 'i');
    const match = text.match(rgx);
    if (match) return match[1];
    if (text.includes('<html') || text.includes('<!DOCTYPE html>')) return text;
    return text;
}

function togglePromptView() {
    if(!lastCompiledPrompt) return;
    const btn = document.getElementById('btn-toggle-prompt');
    if(els.phenoPrompt.style.display === 'none' || els.phenoPrompt.style.display === '') {
        els.phenoText.style.display = 'none'; els.phenoFrame.style.display = 'none'; els.phenoPrompt.style.display = 'block';
        btn.style.background = 'var(--text)'; btn.style.color = 'var(--bg)';
    } else {
        els.phenoPrompt.style.display = 'none'; btn.style.background = ''; btn.style.color = '';
        if(isRenderView) els.phenoFrame.style.display = 'block'; else els.phenoText.style.display = 'block';
    }
}

function toggleArtifactView() {
    if(!lastRawOutput) return;
    isRenderView = !isRenderView;
    const btn = document.getElementById('btn-toggle-view');
    const traceBtn = document.getElementById('btn-toggle-prompt');
    els.phenoPrompt.style.display = 'none'; traceBtn.style.background = ''; traceBtn.style.color = '';
    
    if(isRenderView) {
        els.phenoText.style.display = 'none'; els.phenoFrame.style.display = 'block'; btn.innerText = "SOURCE";
        els.phenoFrame.srcdoc = extractArtifactHTML(lastRawOutput);
    } else {
        els.phenoText.style.display = 'block'; els.phenoFrame.style.display = 'none'; btn.innerText = "RENDER";
    }
}

function maximizeArtifact() {
    if(!lastRawOutput) return;
    toggleModal('artifact-modal'); document.getElementById('artifact-max-frame').srcdoc = extractArtifactHTML(lastRawOutput);
}

function copyArtifact() {
    if(!lastRawOutput) return;
    navigator.clipboard.writeText(lastRawOutput).then(() => { logChamber(`> [Artifact] Source copied.`, `log-succ`); })
    .catch(() => {
        const textArea = document.createElement("textarea"); textArea.value = lastRawOutput;
        document.body.appendChild(textArea); textArea.select();
        try { document.execCommand('copy'); logChamber(`> [Artifact] Source copied.`, `log-succ`); } 
        catch (err) { logChamber(`> [Artifact] Copy failed.`, `log-err`); }
        document.body.removeChild(textArea);
    });
}

function downloadArtifact() {
    if(!lastRawOutput) return;
    const htmlContent = extractArtifactHTML(lastRawOutput);
    const isHtml = htmlContent.includes('<html') || htmlContent.includes('<!DOCTYPE') || htmlContent.includes('<style>');
    const finalContent = isHtml ? htmlContent : lastRawOutput;
    const blob = new Blob([finalContent], {type: isHtml ? 'text/html' : 'text/plain'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `artifact_${Date.now()}.${isHtml ? 'html' : 'md'}`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    logChamber(`> [Artifact] Downloaded locally.`, `log-succ`);
}

function downloadBundle() {
    if(!lastRawOutput) return;
    let bundle = `# GENOMA ECOLOGY BUNDLE\n\n## 1. ACTIVE GENOME (SYSTEM PROMPT)\n\n\`\`\`text\n${compileGenome()}\n\`\`\`\n\n`;
    bundle += `## 2. ENVIRONMENT (TARGET TASK)\n\n\`\`\`text\n${document.getElementById('target-task').value}\n\`\`\`\n\n`;
    bundle += `## 3. PHENOTYPE (OUTPUT ARTIFACT)\n\n\`\`\`text\n${lastRawOutput}\n\`\`\`\n`;
    const blob = new Blob([bundle], {type: 'text/markdown'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `genoma_bundle_${Date.now()}.md`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    logChamber(`> [Artifact] Ecology Bundle downloaded.`, `log-succ`);
}

// --- EXPRESSION & EXTENSION INTERACTION ---
function compileGenome() {
    const activeExons = genome.filter(c => c.state === 'EXON' && c.type !== 'CMT');
    if(activeExons.length === 0) return "You are a helpful assistant."; 
    return "You must strictly adhere to the following instructions:\n\n" + activeExons.map(e => `[${e.type}]: ${e.payload}\n`).join('');
}

async function expressPhenotype() {
    let targetTask = document.getElementById('target-task').value.trim();
    
    // EXTENSION SUPERPOWER: Read live tab if no task provided
    if (!targetTask) {
        logChamber(`> [Context] Ingesting Live Browser Tab...`, `log-step`);
        try {
            const tabRes = await sendBackgroundRequest("GET_TAB_CONTEXT", null);
            if (tabRes.success && tabRes.data && tabRes.data.context) {
                targetTask = tabRes.data.context;
                document.getElementById('target-task').value = targetTask;
                logChamber(`> [Context] Tab ingested successfully.`, `log-succ`);
            } else {
                logChamber(`> [Context] Failed to read active tab.`, `log-err`);
            }
        } catch (e) {
            logChamber(`> [Context] Extension permissions issue.`, `log-err`);
        }
    }

    scrollToCol('field'); setControls(true);
    togglePanelLoader('panel-phenotype', true, "EXPRESSING PHENOTYPE"); setStatus("SYS: EXPRESSING");
    
    logChamber(`--- EXPRESSION CYCLE ---`, `log-sys`);
    const compiledSystemPrompt = compileGenome();
    lastCompiledPrompt = `[ COMPILED PROMPT ]\n\n${compiledSystemPrompt}\n\n[ TARGET TASK ]\n\n${targetTask || "Execute your instructions."}`;
    els.phenoPrompt.innerText = lastCompiledPrompt;

    const parts = [{ text: targetTask || "Execute your instructions." }];
    genome.filter(c => c.state === 'EXON' && c.type !== 'CMT').forEach(exon => {
        if(exon.images && exon.images.length > 0) {
            parts.push({ text: `\n[Reference Image(s) for Locus: ${exon.type}]` });
            exon.images.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } }));
        }
    });
    if(taskImages.length > 0) {
        parts.push({ text: `\n[General Task Vision Context]` });
        taskImages.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } }));
    }

    const payload = { contents: [{ parts: parts }], systemInstruction: { parts: [{ text: compiledSystemPrompt }] } };

    try {
        const response = await sendBackgroundRequest("GEMINI_API", payload);
        if (!response.success) throw new Error(response.error);
        
        lastRawOutput = response.data.candidates[0].content.parts[0].text;
        togglePanelLoader('panel-phenotype', false); logChamber(`> [Evaluate] Phenotype rendered.`, `log-succ`);
        setStatus("SYS: IDLE");
        els.phenoText.innerHTML = escapeHTML(lastRawOutput);
        if(isRenderView) els.phenoFrame.srcdoc = extractArtifactHTML(lastRawOutput);
        
        // Auto-inject CSS if instructed by the prompt
        if(lastRawOutput.includes("```css")) {
            const cssMatch = lastRawOutput.match(/```css\n([\s\S]*?)```/);
            if (cssMatch) {
                logChamber(`> [Mutate] CSS Detected. Injecting into live site...`, `log-step`);
                sendBackgroundRequest("MUTATE_DOM", { css: cssMatch[1] });
            }
        }
    } catch (e) {
        togglePanelLoader('panel-phenotype', false); logChamber(`> [Mutate] Expression Collapse.`, `log-err`);
        if ((e.message || "").toLowerCase().includes("api key")) {
            lastRawOutput = lastCompiledPrompt;
            isRenderView = false;
            els.phenoFrame.style.display = 'none';
            els.phenoText.style.display = 'block';
            els.phenoText.innerHTML = `<strong class="danger-text">[ MODEL DISABLED ]</strong>\n\n${escapeHTML(lastCompiledPrompt)}\n\n[ Configure a Gemini API key in the top bar to execute this prompt against the model. ]`;
            setStatus("SYS: API KEY REQUIRED", true);
        } else {
            setStatus("SYS: ERROR", true); els.phenoText.innerHTML = `<span class="danger-text">[ FATAL: EXPRESSION COLLAPSE ]</span>`;
        }
    }
    setControls(false); saveToStorage();
}

// --- AI BREEDER & PUNNETT SQUARE LOGIC ---
const codonSchema = { type: "ARRAY", items: { type: "OBJECT", properties: { type: { type: "STRING" }, payload: { type: "STRING" }, state: { type: "STRING" }, weight: { type: "INTEGER" } }, required: ["type", "payload", "state"] } };
const genSchema = { type: "OBJECT", properties: { variants: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, sequence: codonSchema }, required: ["name", "sequence"] } } }, required: ["variants"] };

async function triggerAiOp(type) {
    const prompt = document.getElementById('ai-prompt').value.trim();
    if(!prompt && type === 'generate') return;
    setControls(true); scrollToCol('palette');
    
    let directive, logMsg, loadMsg;
    if(type === 'generate') { logMsg = "SYNTHESIS"; loadMsg = "SYNTHESIZING MATRIX"; directive = `Generate exactly 4 distinct architectural variants to achieve this goal: "${prompt}". Make them diverse in reasoning and constraints.`; }
    if(type === 'mutate') { logMsg = "MUTATION"; loadMsg = "MUTATING ALLELES"; directive = `Genome:\n${JSON.stringify(genome)}\n\nDirective: "${prompt || 'Improve'}". Rewrite alleles.`; }
    if(type === 'diverge') { logMsg = "DIVERGENCE"; loadMsg = "FORCING DIVERGENCE"; directive = `Genome:\n${JSON.stringify(genome)}\n\nApply a 'Deceptive Stepping Stone'. Abandon obvious approach. Invert reasoning/form.`; }

    togglePanelLoader('panel-upstream', true, loadMsg); setStatus(`SYS: ${logMsg}`);
    logChamber(`--- ${logMsg} ---`, `log-sys`); logChamber(`> [Encode] Sequencing...`, `log-step`);

    const payload = {
        contents: [{ parts: getSynthesisParts(directive) }],
        systemInstruction: { parts: [{ text: AI_BREEDER_PROMPT }] },
        generationConfig: { responseMimeType: "application/json", responseSchema: type === 'generate' ? genSchema : codonSchema }
    };

    try {
        const response = await sendBackgroundRequest("GEMINI_API", payload);
        if (!response.success) throw new Error(response.error);
        
        const result = JSON.parse(response.data.candidates[0].content.parts[0].text);
        togglePanelLoader('panel-upstream', false);
        
        if (type === 'generate') {
            const variants = result.variants || [];
            const grid = document.getElementById('punnett-grid');
            grid.innerHTML = ''; document.getElementById('punnett-modal-title').innerText = "[ CHOOSE ] :: STRUCTURAL MATRIX";
            
            variants.forEach((v, index) => {
                const card = document.createElement('div'); card.className = "punnett-card";
                card.addEventListener('click', () => {
                    saveState(); genome = v.sequence.map(c => ({ id: generateId(), type: c.type, payload: c.payload || '', state: c.state || 'EXON', weight: c.weight || 50 }));
                    saveToStorage(); renderGenomeUI(); toggleModal('punnett-modal');
                    logChamber(`> [Trace] Structural Architecture stabilized.`, `log-succ`); scrollToCol('genotype');
                });
                let txt = v.sequence.map(c => `[${c.type}] ${c.payload}`).join('\n');
                card.innerHTML = `<div class="p-head"><span>VARIANT 00${index + 1}</span><span>${v.sequence.length} G</span></div><div class="p-body"><b>${escapeHTML(v.name || 'Architecture')}</b><br><br>${escapeHTML(txt)}</div>`;
                grid.appendChild(card);
            });
            setStatus("SYS: IDLE"); toggleModal('punnett-modal'); setControls(false);
            return;
        }

        saveState(); genome = result.map(c => ({ id: generateId(), type: c.type, payload: c.payload || '', state: c.state || 'EXON', weight: c.weight || 50 }));
        saveToStorage(); renderGenomeUI(); logChamber(`> [Trace] DNA stabilized.`, `log-succ`); setStatus("SYS: IDLE"); scrollToCol('genotype');
    } catch(e) {
        togglePanelLoader('panel-upstream', false); logChamber(`> [Failure] Processing rejected.`, `log-err`); setStatus("SYS: ERROR", true);
    }
    setControls(false);
}

class PunnettSquare {
    resolveDominance(alleleA, alleleB) {
        const wA = alleleA ? (alleleA.weight || 50) : 0; const wB = alleleB ? (alleleB.weight || 50) : 0;
        if (wA > wB) return alleleA; if (wB > wA) return alleleB;
        if (alleleA && alleleB) return { ...alleleA, payload: `${alleleA.payload} AND ${alleleB.payload}`, images: [...(alleleA.images||[]), ...(alleleB.images||[])] };
        return alleleA || alleleB;
    }
    cross(p1Seq, p2Seq) {
        const p1Dict = {}; p1Seq.forEach(c => p1Dict[c.type] = c);
        const p2Dict = {}; p2Seq.forEach(c => p2Dict[c.type] = c);
        const allLoci = [...new Set([...Object.keys(p1Dict), ...Object.keys(p2Dict)])];
        const divLoci = allLoci.filter(l => (p1Dict[l]?.payload !== p2Dict[l]?.payload)).slice(0, 2);
        const stableLoci = allLoci.filter(l => !divLoci.includes(l));
        if (divLoci.length === 0) divLoci.push(allLoci[0]);

        const getG = (d1, d2, loci) => {
            const genes = loci.map(l => [d1[l], d2[l]]);
            const f = (a, b) => [].concat(...a.map(d => b.map(e => [].concat(d, e))));
            const cart = (a, b, ...c) => (b ? cart(f(a, b), ...c) : a);
            return cart(...genes);
        };

        const g1 = getG(p1Dict, p1Dict, divLoci); const g2 = getG(p1Dict, p2Dict, divLoci);
        const pairs = [ [g2[0], g2[0]], [g2[0], g2[1] || g2[0]], [g2[1] || g2[0], g2[0]], [g2[1] || g2[0], g2[1] || g2[0]] ];
        
        return pairs.map((pair, idx) => {
            const seq = [];
            stableLoci.forEach(l => { const a = this.resolveDominance(p1Dict[l], p2Dict[l]); if(a) seq.push({...a}); });
            divLoci.forEach((l, lIdx) => { const a = this.resolveDominance(pair[0][lIdx], pair[1][lIdx]); if(a) seq.push({...a}); });
            return { trait: `F1 VARIANT 00${idx+1}`, sequence: seq };
        });
    }
}

async function generatePunnettSquare() {
    if(genome.length === 0) return;
    const prompt = document.getElementById('ai-prompt').value.trim() || "Provide a wild-type dominant mutation to cross.";
    
    setControls(true); scrollToCol('palette');
    togglePanelLoader('panel-upstream', true, "BREEDING MATRIX"); setStatus("SYS: CROSSING");
    
    logChamber(`--- DIHYBRID CROSS ---`, `log-sys`); logChamber(`> [Encode] Extracting Gametes...`, `log-step`);

    const payload = {
        contents: [{ parts: getSynthesisParts(`Parent A:\n${JSON.stringify(genome)}\n\nConstraint: "${prompt}". Generate divergent Parent B with different alleles.`) }],
        systemInstruction: { parts: [{ text: AI_BREEDER_PROMPT }] },
        generationConfig: { responseMimeType: "application/json", responseSchema: codonSchema }
    };

    try {
        const response = await sendBackgroundRequest("GEMINI_API", payload);
        if (!response.success) throw new Error(response.error);
        
        const parentB = JSON.parse(response.data.candidates[0].content.parts[0].text);
        logChamber(`> [Cross] Executing Mendelian Matrix...`, `log-step`);
        
        const ps = new PunnettSquare();
        const candidates = ps.cross(genome, parentB);

        const grid = document.getElementById('punnett-grid');
        grid.innerHTML = ''; document.getElementById('punnett-modal-title').innerText = "[ DIHYBRID CROSS ] :: PUNNETT MATRIX";
        
        candidates.forEach((cand, index) => {
            const card = document.createElement('div'); card.className = "punnett-card";
            card.addEventListener('click', () => {
                saveState(); genome = cand.sequence.map(c => ({ id: generateId(), type: c.type, payload: c.payload || '', state: c.state || 'EXON', weight: c.weight || 50 }));
                saveToStorage(); renderGenomeUI(); toggleModal('punnett-modal');
                logChamber(`> [Trace] Selected Lineage stabilized.`, `log-succ`); scrollToCol('genotype');
            });
            let txt = cand.sequence.map(c => `[${c.type}] ${c.payload}`).join('\n');
            card.innerHTML = `<div class="p-head"><span>00${index + 1} OFFSPRING</span><span>${cand.sequence.length} G</span></div><div class="p-body"><b>${escapeHTML(cand.trait)}</b><br><br>${escapeHTML(txt)}</div>`;
            grid.appendChild(card);
        });
        
        togglePanelLoader('panel-upstream', false); setStatus("SYS: IDLE"); toggleModal('punnett-modal');
    } catch(e) {
        togglePanelLoader('panel-upstream', false); logChamber(`> [Failure] Breeding Failed.`, `log-err`); setStatus("SYS: ERROR", true);
    }
    setControls(false);
}
