const uploadForm = document.getElementById("uploadForm");
const videoInput = document.getElementById("videoInput");
const uploadBtn = document.getElementById("uploadBtn");
const resetBtn = document.getElementById("resetBtn");
const aggressivenessEl = document.getElementById("aggressiveness");

const jobIdInput = document.getElementById("jobIdInput");
const loadJobBtn = document.getElementById("loadJobBtn");
const jobStatus = document.getElementById("jobStatus");
const statusLine = document.getElementById("statusLine");
const warningLine = document.getElementById("warningLine");
const progressBar = document.getElementById("progressBar");
const stageLine = document.getElementById("stageLine");

const srtLink = document.getElementById("srtLink");
const jsonLink = document.getElementById("jsonLink");
const scenesLink = document.getElementById("scenesLink");
const clipsEl = document.getElementById("clips");
const zipLink = document.getElementById("zipLink");

const completedActions = document.getElementById("completedActions");
const viewClipsBtn = document.getElementById("viewClipsBtn");

// Manual Clips UI
const manualClipsSection = document.getElementById("manualClipsSection");
const previewVideo = document.getElementById("previewVideo");
const clipInputsList = document.getElementById("clipInputsList");
const addClipSelectionBtn = document.getElementById("addClipSelectionBtn");
const submitClipsBtn = document.getElementById("submitClipsBtn");
const clipsCountBadge = document.getElementById("clipsCountBadge");
const subtitleStyleSelect = document.getElementById("subtitleStyleSelect");

// Timeline UI
const timelineTrack = document.getElementById("timelineTrack");
const timelineSelection = document.getElementById("timelineSelection");
const handleLeft = document.getElementById("handleLeft");
const handleRight = document.getElementById("handleRight");
const timeStartLabel = document.getElementById("timeStartLabel");
const timeEndLabel = document.getElementById("timeEndLabel");
const setStartBtn = document.getElementById("setStartBtn");
const setEndBtn = document.getElementById("setEndBtn");

let pollTimer = null;
let customClips = [];
let tStart = 0;
let tEnd = 10;
let vidDuration = 100;
let isDraggingLeft = false;
let isDraggingRight = false;

function renderClipsEmpty() {
  clipsEl.innerHTML = `
    <div class="empty">
      <div class="emptyTitle">Aún no hay clips</div>
      <div class="emptySub">Cuando el job termine, aparecerán aquí con miniaturas y descarga directa.</div>
    </div>
  `;
}

function setLinks(jobId) {
  srtLink.href = `/api/jobs/${encodeURIComponent(jobId)}/files/captions.srt`;
  jsonLink.href = `/api/jobs/${encodeURIComponent(jobId)}/files/captions.json`;
  scenesLink.href = `/api/jobs/${encodeURIComponent(jobId)}/files/scenes.json`;
  zipLink.href = `/api/jobs/${encodeURIComponent(jobId)}/clips.zip`;
}

function setLinkEnabled(a, enabled) {
  a.style.opacity = enabled ? "1" : "0.45";
  a.style.pointerEvents = enabled ? "auto" : "none";
}

function humanStatus(status) {
  if (status === "created" || status === "queued") return "En cola";
  if (status === "running") return "Procesando...";
  if (status === "completed") return "Listo";
  if (status === "failed") return "Falló";
  return String(status);
}

function humanStage(stage) {
  if (!stage) return "";
  const map = {
    created: "Creando job",
    uploading: "Subiendo",
    extract_audio: "Extrayendo audio",
    transcribe: "Generando subtítulos",
    awaiting_clips: "Esperando recortes manuales",
    ai_analysis: "Análisis IA",
    detect_scenes: "Detectando escenas",
    select_clips: "Seleccionando clips",
    render_clips: "Renderizando clips",
    done: "Listo",
  };
  return map[stage] ?? String(stage);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms}`;
}

function updateTimelineUI() {
  if (vidDuration <= 0) return;
  const p1 = (tStart / vidDuration) * 100;
  const p2 = (tEnd / vidDuration) * 100;
  
  handleLeft.style.left = `${p1}%`;
  handleRight.style.left = `${p2}%`;
  
  timelineSelection.style.left = `${p1}%`;
  timelineSelection.style.width = `${p2 - p1}%`;
  
  timeStartLabel.textContent = formatTime(tStart);
  timeEndLabel.textContent = formatTime(tEnd);
}

function renderClipsList() {
    clipInputsList.innerHTML = "";
    customClips.forEach((c, i) => {
        const rowId = `clip_row_${i}`;
        const row = document.createElement("div");
        row.id = rowId;
        row.className = "clip-input-card";
        row.innerHTML = `
            <div style="font-weight: 500; font-size: 14px;">Clip ${i + 1}</div>
            <div class="row" style="align-items: center; gap: 8px;">
                <div class="time-badge">${formatTime(c.start)}</div>
                <span class="muted" style="font-size: 11px;">hasta</span>
                <div class="time-badge">${formatTime(c.end)}</div>
                <button type="button" class="btn secondary" onclick="removeCustomClip(${i})" style="padding: 0.4rem; color: #f43f5e; font-size: 12px; margin-left: auto;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        clipInputsList.appendChild(row);
    });
    clipsCountBadge.textContent = customClips.length > 0 ? `(${customClips.length})` : "";
    
    // Auto-scroll list to bottom
    clipInputsList.scrollTop = clipInputsList.scrollHeight;
}

window.removeCustomClip = (index) => {
    customClips.splice(index, 1);
    renderClipsList();
};

function renderStatus(job) {
  statusLine.textContent = `Estado: ${humanStatus(job.status)}`;
  const p = Math.max(0, Math.min(1, Number(job.progress ?? 0)));
  progressBar.style.width = `${Math.round(p * 100)}%`;
  stageLine.textContent = job.stage ? `Paso: ${humanStage(job.stage)}` : "";

  warningLine.textContent = (job.warnings && job.warnings.length > 0) ? job.warnings[0] : "";
  warningLine.style.display = (job.warnings && job.warnings.length > 0) ? "block" : "none";

  if (job.status === "completed") {
      completedActions.style.display = "block";
      viewClipsBtn.onclick = () => {
          document.getElementById("modalProjectTitle").textContent = job.originalFilename;
          loadClips(job.id, true);
      }
  } else {
      completedActions.style.display = "none";
  }

  jobStatus.textContent = JSON.stringify(
    {
      id: job.id,
      status: job.status,
      error: job.error ?? null,
      warnings: job.warnings ?? [],
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      originalFilename: job.originalFilename,
      artifacts: job.artifacts,
    },
    null,
    2,
  );
}

function clearClips() {
  renderClipsEmpty();
}

async function downloadClipWithTitle(url, defaultName) {
  const title = prompt("Asigna un nombre para tu clip:", defaultName) || defaultName;
  const finalName = title.endsWith(".mp4") ? title : title + ".mp4";
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch(e) {
    alert("Hubo un error al descargar el clip.");
  }
}

async function loadClips(jobId, showModal = false) {
  clipsEl.innerHTML = "";
  const modalClipsGrid = document.getElementById("modalClipsGrid");
  if(showModal) {
    modalClipsGrid.innerHTML = "Cargando clips...";
    document.getElementById("projectModal").style.display = "flex";
  }

  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/clips`);
  if (!res.ok) return;
  const data = await res.json();
  const items = data.clips ?? [];
  
  if (items.length === 0) {
    if(showModal) modalClipsGrid.innerHTML = "<p class='muted'>No hay clips para este proyecto.</p>";
    else renderClipsEmpty();
    return;
  }
  
  if(showModal) modalClipsGrid.innerHTML = "";

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const url = `/api/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(item.video)}`;
    const thumbUrl = item.thumb
      ? `/api/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(item.thumb)}`
      : null;
      
    const wrap = document.createElement("div");
    wrap.className = "clip-card-pro";
    wrap.style.width = "220px";
    wrap.style.flexShrink = "0";
    wrap.style.background = "#141416";
    wrap.style.border = "1px solid #28282b";
    wrap.style.borderRadius = "16px";
    wrap.style.overflow = "hidden";
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.boxShadow = "0 8px 24px rgba(0,0,0,0.4)";
    wrap.style.transition = "transform 0.2s ease";
    
    wrap.innerHTML = `
      <div style="position: relative; width: 100%; aspect-ratio: 9/16; background: #000;">
         <video controls preload="metadata" poster="${thumbUrl || ''}" src="${url}" style="width: 100%; height: 100%; object-fit: cover;"></video>
      </div>
      <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px; flex: 1;">
          <div style="font-weight: 700; font-size: 16px; color: #fff; display: flex; justify-content: space-between; align-items: center;">
             <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;" title="${item.video}">${item.video}</span>
             <span style="font-size: 12px; color: #8b8b92; font-weight: 500;">9:16</span>
          </div>
          <button class="primary-btn" onclick="downloadClipWithTitle('${url}', '${item.video}')" style="width: 100%; padding: 12px 0; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: auto;">
             <i class="fa-solid fa-download"></i> Descargar
          </button>
      </div>
    `;
    
    wrap.onmouseenter = () => wrap.style.transform = "translateY(-4px)";
    wrap.onmouseleave = () => wrap.style.transform = "translateY(0)";

    if(showModal) modalClipsGrid.appendChild(wrap);
    else clipsEl.appendChild(wrap);
  }
}

async function loadJob(jobId) {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) {
    jobStatus.textContent = `No se pudo cargar job: ${jobId}`;
    return null;
  }
  const job = await res.json();
  renderStatus(job);
  setLinks(jobId);

  setLinkEnabled(srtLink, Boolean(job.artifacts?.captionsSrt));
  setLinkEnabled(jsonLink, Boolean(job.artifacts?.captionsJson));
  setLinkEnabled(scenesLink, Boolean(job.artifacts?.scenesJson));
  setLinkEnabled(zipLink, Boolean(job.artifacts?.clipsDir));

  if (job.status === "completed") {
    await loadClips(jobId);
  }

  if (job.stage === "awaiting_clips") {
    if (manualClipsSection.style.display !== "block") {
        manualClipsSection.style.display = "block";
        previewVideo.src = `/api/jobs/${encodeURIComponent(jobId)}/files/input.mp4`;
        
        previewVideo.onloadedmetadata = () => {
           vidDuration = previewVideo.duration;
           if (vidDuration) {
              tStart = 0;
              tEnd = Math.min(vidDuration, 15);
              updateTimelineUI();
           }
        };
        renderClipsList();
    }
  } else {
    manualClipsSection.style.display = "none";
  }

  return job;
}

// --- Drag Logic ---
const getPointerPerc = (e) => {
  const rect = timelineTrack.getBoundingClientRect();
  let x = e.clientX ?? (e.touches ? e.touches[0].clientX : 0);
  x = Math.max(rect.left, Math.min(x, rect.right));
  return (x - rect.left) / rect.width;
};

handleLeft.addEventListener("mousedown", (e) => { isDraggingLeft = true; e.preventDefault(); });
handleRight.addEventListener("mousedown", (e) => { isDraggingRight = true; e.preventDefault(); });
handleLeft.addEventListener("touchstart", (e) => { isDraggingLeft = true; e.preventDefault(); }, {passive: false});
handleRight.addEventListener("touchstart", (e) => { isDraggingRight = true; e.preventDefault(); }, {passive: false});

const onDrag = (e) => {
  if (!isDraggingLeft && !isDraggingRight) return;
  const perc = getPointerPerc(e);
  let time = perc * vidDuration;
  if (isDraggingLeft) {
     tStart = Math.min(time, tEnd - 0.5);
     previewVideo.currentTime = tStart;
  } else {
     tEnd = Math.max(time, tStart + 0.5);
     previewVideo.currentTime = tEnd;
  }
  updateTimelineUI();
};
const onStopDrag = () => { isDraggingLeft = false; isDraggingRight = false; };

window.addEventListener("mousemove", onDrag);
window.addEventListener("touchmove", onDrag, {passive: false});
window.addEventListener("mouseup", onStopDrag);
window.addEventListener("touchend", onStopDrag);

timelineTrack.addEventListener("click", (e) => {
  if (e.target === handleLeft || e.target === handleRight) return;
  const perc = getPointerPerc(e);
  const time = Math.max(0, Math.min(perc * vidDuration, vidDuration));
  const distL = Math.abs(time - tStart);
  const distR = Math.abs(time - tEnd);
  if (distL < distR) {
    tStart = Math.min(time, tEnd - 0.5);
    previewVideo.currentTime = tStart;
  } else {
    tEnd = Math.max(time, tStart + 0.5);
    previewVideo.currentTime = tEnd;
  }
  updateTimelineUI();
});

setStartBtn.addEventListener("click", () => {
   let time = previewVideo.currentTime;
   tStart = Math.min(time, tEnd - 0.5);
   updateTimelineUI();
});
setEndBtn.addEventListener("click", () => {
   let time = previewVideo.currentTime;
   tEnd = Math.max(time, tStart + 0.5);
   updateTimelineUI();
});

addClipSelectionBtn.addEventListener("click", () => {
   customClips.push({ start: Number(tStart.toFixed(2)), end: Number(tEnd.toFixed(2)) });
   renderClipsList();
});

submitClipsBtn.addEventListener("click", async () => {
  const jobId = jobIdInput.value.trim();
  if (!jobId) return;

  const clips = customClips;

  if (clips.length === 0) {
    alert("Por favor añade al menos un clip a la lista.");
    return;
  }

  submitClipsBtn.disabled = true;
  submitClipsBtn.textContent = "Procesando...";

  const subtitleSelect = document.getElementById("subtitleStyleSelect");
  const subtitleStyle = subtitleSelect ? subtitleSelect.value : "opus";

  try {
    const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/clips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clips, subtitleStyle }),
    });

    if (res.ok) {
        customClips = [];
        manualClipsSection.style.display = "none";
        startPolling(jobId);
    } else {
        alert("Error enviando los clips al backend.");
    }
  } finally {
      submitClipsBtn.disabled = false;
      submitClipsBtn.innerHTML = 'Procesar Clips <span id="clipsCountBadge"></span>';
      renderClipsList();
  }
});

function startPolling(jobId) {
  stopPolling();
  pollTimer = setInterval(async () => {
    const job = await loadJob(jobId);
    if (!job) return;
    if (job.status === "completed" || job.status === "failed" || job.stage === "awaiting_clips") {
      stopPolling();
      loadProjects();
    }
  }, 1500);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = videoInput.files?.[0];
  if (!file) return;

  uploadBtn.disabled = true;
  uploadBtn.textContent = "Subiendo...";

  try {
    const fd = new FormData();
    fd.append("video", file);
    fd.append("aggressiveness", aggressivenessEl.value);

    const res = await fetch("/api/jobs", { method: "POST", body: fd });
    const data = await res.json();

    if (!res.ok) {
      jobStatus.textContent = JSON.stringify(data, null, 2);
      return;
    }

    const jobId = data.jobId;
    jobIdInput.value = jobId;
    await loadJob(jobId);
    startPolling(jobId);
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = "Subir y procesar";
  }
});

loadJobBtn.addEventListener("click", async () => {
  const jobId = jobIdInput.value.trim();
  if (!jobId) return;
  await loadJob(jobId);
  startPolling(jobId);
});

resetBtn.addEventListener("click", () => {
  videoInput.value = "";
  jobIdInput.value = "";
  jobStatus.textContent = "";
  clearClips();
  stopPolling();
  manualClipsSection.style.display = "none";
  customClips = [];
  renderClipsList();
  previewVideo.src = "";
});

renderClipsEmpty();

window.downloadClipWithTitle = downloadClipWithTitle; // Make sure it's accessible inline
async function loadProjects() {
  const grid = document.getElementById("projectsGrid");
  if (!grid) return;
  
  try {
    const res = await fetch("/api/jobs");
    if (!res.ok) return;
    const allJobs = await res.json();
    
    // Filtrar para mostrar SOLAMENTE los proyectos que terminaron correctamente
    const completedJobs = allJobs.filter(job => job.status === "completed");
    
    if(completedJobs.length === 0) {
      grid.innerHTML = "<p class='muted'>No hay proyectos completados aún.</p>";
      return;
    }
    
    grid.innerHTML = "";
    
    for (const job of completedJobs) {
      const card = document.createElement("div");
      card.className = "project-card";
      card.onclick = () => {
        document.getElementById("modalProjectTitle").textContent = job.originalFilename;
        loadClips(job.id, true);
      };
      
      const thumbUrl = job.artifacts?.inputThumb ? `/api/jobs/${encodeURIComponent(job.id)}/files/input_thumb.jpg` : "https://images.unsplash.com/photo-1542204165-65bf26472b9b?auto=format&fit=crop&q=80&w=400&h=200";
      const dateStr = new Date(job.createdAt).toLocaleDateString("es-ES", { day:"numeric", month:"short", year:"numeric" });
      
      card.innerHTML = `
        <div class="thumbWrapper" style="cursor: pointer; aspect-ratio: 16/9; height: auto; border-radius: 12px; overflow: hidden; position: relative;">
            <img src="${thumbUrl}" alt="thumbnail" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='https://images.unsplash.com/photo-1542204165-65bf26472b9b?auto=format&fit=crop&q=80&w=400&h=200'">
            <span class="plan-badge" style="background: rgba(0,0,0,0.7); color:#fff; border: 1px solid rgba(255,255,255,0.2);">Listo</span>
        </div>
        <div class="card-meta" style="margin-top: 12px; cursor: pointer;">
            <div style="font-weight: 700; font-size: 15px; color: #fff; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;" title="${job.originalFilename}">${job.originalFilename}</div>
            <div class="card-sub" style="font-size: 12px; color: var(--text-muted); opacity:0.8;">
                ${dateStr} <span style="margin: 0 4px; opacity:0.5;">•</span> ${job.id.substring(0,8)}
            </div>
        </div>
      `;
      grid.appendChild(card);
    }
  } catch(e) {
    grid.innerHTML = "<p class='error'>Error cargando proyectos.</p>";
  }
}

loadProjects();
