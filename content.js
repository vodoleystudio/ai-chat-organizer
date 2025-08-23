(() => {
  // ---- Storage helpers ----
  const STORAGE_KEY = "cgpt_groups_v1";
  const STORAGE_KEY_OPEN = "cgpt_groups_open_v1";



  async function getOpenState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY_OPEN, (data) => {
        resolve(!!data[STORAGE_KEY_OPEN]); // true/false
      });
    });
  }
  async function setOpenState(isOpen) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY_OPEN]: !!isOpen }, resolve);
    });
  }

  async function getState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (data) => {
        resolve(
          data[STORAGE_KEY] || {
            folders: {
              "🧠 Ideas": [],
              "📦 Draft": []
            },
            order: ["🧠 Ideas", "📦 Draft"],
			collapsed: {}
          }
        );
      });
    });
  }
  async function setState(state) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: state }, resolve);
    });
  }

  // ---- Utilities ----
  const nowTs = () => Date.now();
  const fmtDate = (ts) =>
    new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

  function getCurrentUrl() {
    return location.href;
  }
  
  async function openConfirmDialog({ title = "Confirm", message = "", confirmText = "Confirm", cancelText = "Cancel", danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "cgpt-modal-overlay";

    const modal = document.createElement("div");
    modal.className = "cgpt-modal";
    modal.innerHTML = `
      <h4>${title}</h4>
      <div class="row">
        <div class="hint" style="white-space:pre-wrap">${message}</div>
      </div>
      <div class="actions">
        <button id="cgptCancel">${cancelText}</button>
        <button id="cgptOk" ${danger ? 'class="danger"' : ""}>${confirmText}</button>
      </div>
    `;

    overlay.appendChild(modal);
    shadow.appendChild(overlay);

    const btnOk = modal.querySelector("#cgptOk");
    const btnCancel = modal.querySelector("#cgptCancel");

    function close(val) {
      overlay.remove();
      resolve(val);
    }

    btnOk.addEventListener("click", () => close(true));
    btnCancel.addEventListener("click", () => close(false));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
      if (e.key === "Enter")  { e.preventDefault(); close(true); }
    });

    // focus on "OK"
    setTimeout(() => btnOk.focus(), 0);
  });
}


  function getConversationTitleFallback() {
    return document.title.replace(/\s+\|\s+ChatGPT.*$/i, "").trim() || "Untitled";
  }

  function normalizeUrl(u) {
    try {
      const url = new URL(u);
      url.protocol = "https:";
      if (url.hostname === "chat.openai.com") url.hostname = "chatgpt.com";
      url.search = "";
      url.hash = "";
      if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
        url.pathname = url.pathname.slice(0, -1);
      }
      return url.origin + url.pathname;
    } catch (e) {
      return String(u).split("#")[0].split("?")[0].replace(/\/+$/,"");
    }
  }
  
  // collapse whitespace
function norm(s){ return (s||"").replace(/\s+/g," ").trim(); }
function cutAfterSep(s){
  const str = norm(s);
  const m = str.match(/\s(?:–|—|-|:)\s/); // first separator like " — "
  return m ? str.slice(0, m.index) : str;
}
// only direct text nodes of <a> (no children/siblings)
function ownText(el){
  return Array.from(el.childNodes)
    .filter(n => n.nodeType === Node.TEXT_NODE)
    .map(n => n.textContent)
    .join(" ");
}

function getSidebarChats() {
  const anchors = Array.from(document.querySelectorAll('a[href*="/c/"]'));
  const seen = new Set();
  const res = [];

  for (const a of anchors) {
    let href = a.getAttribute("href") || "";
    try { if (!/^https?:\/\//.test(href)) href = new URL(href, location.origin).toString(); } catch {}

    // title: use aria-label/title, then own text node, then first child's text
    const rawTitle =
      a.getAttribute("aria-label") ||
      a.getAttribute("title") ||
      ownText(a) ||
      a.firstElementChild?.textContent ||
      a.textContent || "";

    let title = cutAfterSep(rawTitle);
    title = norm(title);

    // desc: attributes only (no nextSibling/parent.querySelector)
    let desc = norm(
      a.getAttribute("aria-description") ||
      a.getAttribute("data-description") ||
      ""
    );
    desc = cutAfterSep(desc);
    if (desc === title) desc = "";

    if (!href || !title) continue;
    const nurl = normalizeUrl(href);
    if (seen.has(nurl)) continue;
    seen.add(nurl);

    res.push({ title, desc, url: href, nurl });
  }
  return res;
}


function extractUrlFromDt(dt){
  if (!dt) return "";
  // when dragging <a>, browsers usually put text/uri-list
  if (Array.from(dt.types || []).includes("text/uri-list")) {
    const u = dt.getData("text/uri-list").split(/\r?\n/)[0].trim();
    if (u) return u;
  }
  // fallback — text/plain
  const t = (dt.getData("text/plain") || "").trim();
  try { return t && new URL(t) ? t : ""; } catch { return ""; }
}


  
  function filterChatsBySubstring(q) {
    const all = getSidebarChats();
    const needle = (q || "").trim().toLowerCase();
    if (!needle) return all;
    return all.filter(it =>
      it.title.toLowerCase().includes(needle) ||
      (it.desc || "").toLowerCase().includes(needle)
    );
  }

function openAddRequestDialog(targetFolder) {
  const overlay = document.createElement("div");
  overlay.className = "cgpt-modal-overlay";
  const modal = document.createElement("div");
  modal.className = "cgpt-modal";
  modal.innerHTML = `
    <h4>Add chat to “${targetFolder}”</h4>
    <div class="row">
      <input type="search" id="chatSearch" placeholder="Search by title or description...">
      <div class="hint">
        Legend: <span style="background:#5a2f00;color:#fff;border-radius:4px;padding:1px 6px">orange</span> — already in this group,
        <span style="background:#4d4a00;color:#fff;border-radius:4px;padding:1px 6px">yellow</span> — already in another group.
      </div>
      <select id="chatSelect" size="8" style="background:#2a2a2a;color:#fff"></select>
    </div>
    <div class="actions">
      <button id="addBtn">Add</button>
      <button id="cancelBtn">Cancel</button>
    </div>
  `;
  overlay.appendChild(modal);
  shadow.appendChild(overlay);

  const searchEl = modal.querySelector("#chatSearch");
  const selectEl = modal.querySelector("#chatSelect");
  const cancelBtn = modal.querySelector("#cancelBtn");
  const addBtn = modal.querySelector("#addBtn");

  // highlight colors
  const COLOR_DEFAULT_BG = "#2a2a2a";
  const COLOR_DEFAULT_FG = "#ffffff";
  const COLOR_HERE_BG    = "#5a2f00"; // dark orange
  const COLOR_ELSE_BG    = "#4d4a00"; // dark yellow

  function renderOptions(list) {
    selectEl.innerHTML = "";

    list.forEach((it) => {
      const opt = document.createElement("option");

      // Base label
      const base = it.desc ? `${it.title} — ${it.desc}` : it.title;

      // Where is this chat currently?
      const loc = findSavedPage(it.url); // { folderName, index } | null
      const inSomeFolder = !!loc;
      const inThisFolder = loc && loc.folderName === targetFolder;

      // Text with placement notes
      let suffix = "";
      if (inThisFolder) {
        suffix = " [already here]";
      } else if (inSomeFolder) {
        suffix = ` (in group: ${loc.folderName})`;
      }

      opt.value = it.url;
      opt.textContent = (base + suffix).slice(0, 240);
      opt.dataset.title = it.title;
      if (loc) opt.dataset.inFolder = loc.folderName;

      // Highlight by status
      if (inThisFolder) {
        opt.style.background = COLOR_HERE_BG;
        opt.style.color = "#fff";
        opt.title = "This chat is already in the selected group";
      } else if (inSomeFolder) {
        opt.style.background = COLOR_ELSE_BG;
        opt.style.color = "#fff";
        opt.title = `This chat is already in group: ${loc.folderName}`;
      } else {
        opt.style.background = COLOR_DEFAULT_BG;
        opt.style.color = COLOR_DEFAULT_FG;
      }

      selectEl.appendChild(opt);
    });

    if (selectEl.options.length) selectEl.selectedIndex = 0;
  }

  // initial list
  renderOptions(filterChatsBySubstring(""));

  // filter
  searchEl.addEventListener("input", () => {
    const q = searchEl.value;
    const list = filterChatsBySubstring(q);
    renderOptions(list);
  });

  // add
  addBtn.addEventListener("click", async () => {
    const opt = selectEl.selectedOptions[0];
    if (!opt) { alert("Select a chat from the list."); return; }
    const url = opt.value;
    const title = opt.dataset.title || "Untitled";
    await moveOrInsertPageByUrl(targetFolder, url, title);
    overlay.remove();
  });

  // close
  cancelBtn.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

  function openRenameFolderDialog(oldName) {
    const s = stateCache;
    if (!s.folderColors) s.folderColors = {};
    const currentColor = s.folderColors[oldName] || "#444444";

    const overlay = document.createElement("div");
    overlay.className = "cgpt-modal-overlay";

    const modal = document.createElement("div");
    modal.className = "cgpt-modal";
    modal.innerHTML = `
      <h4>Rename group</h4>
      <div class="row">
        <label style="display:flex;gap:8px;align-items:center;">
          <span style="min-width:110px">New name:</span>
          <input type="text" id="rnInput" placeholder="New group name">
        </label>
<label style="display:flex;gap:8px;align-items:center;">
  <span style="min-width:110px">Group color:</span>
  <label class="color-ring"><input type="color" id="rnColor" value="${currentColor}"></label>
  <input type="text" id="rnColorText" value="${currentColor}" style="width:110px" />
</label>
        <div class="hint">Name must be non-empty and unique.</div>
      </div>
      <div class="actions">
            <button id="rnSave">Save</button>
        <button id="rnCancel">Cancel</button>
      </div>
    `;
    overlay.appendChild(modal);
    shadow.appendChild(overlay);

    const inp = modal.querySelector("#rnInput");
    const colorPicker = modal.querySelector("#rnColor");
    const colorText = modal.querySelector("#rnColorText");
    const btnSave = modal.querySelector("#rnSave");
    const btnCancel = modal.querySelector("#rnCancel");

    inp.value = oldName;
    inp.focus();
    inp.setSelectionRange(0, inp.value.length);

    colorPicker.addEventListener("input", () => {
      colorText.value = colorPicker.value;
    });
    colorText.addEventListener("input", () => {
      const v = colorText.value.trim();
      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
        colorPicker.value = v;
      }
    });

    function isValidHex(v) {
      return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
    }

    async function commit() {
      const newName = (inp.value || "").trim();
      let newColor = (colorText.value || "").trim();
      if (!isValidHex(newColor)) newColor = currentColor;

      if (!newName) {
        alert("Group name cannot be empty.");
        inp.focus();
        return;
      }
      const nameChanged = newName !== oldName;
      if (nameChanged && stateCache.folders[newName]) {
        alert("A group with this name already exists.");
        inp.focus();
        return;
      }

      if (nameChanged) {
        s.folders[newName] = s.folders[oldName];
        delete s.folders[oldName];
        s.order = s.order.map(n => (n === oldName ? newName : n));
        s.folderColors[newName] = newColor;
        if (s.folderColors[oldName]) delete s.folderColors[oldName];
      } else {
        s.folderColors[newName] = newColor;
      }

      await setState(s);
      stateCache = await getState();

      render(panel.querySelector("#searchInput").value);

      const sec = panel.querySelector(`.folder[data-folder="${CSS.escape(newName)}"]`);
      if (sec) {
        sec.scrollIntoView({ block: "center", behavior: "smooth" });
        sec.style.outline = "2px solid #fff";
        setTimeout(() => (sec.style.outline = ""), 900);
      }

      overlay.remove();
    }

    btnSave.addEventListener("click", commit);
    btnCancel.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); overlay.remove(); }
    });
  }
  
  function getContrastColor(hex) {
  // normalize #rgb -> #rrggbb
  let h = hex.replace('#','');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.substr(0,2),16);
  const g = parseInt(h.substr(2,2),16);
  const b = parseInt(h.substr(4,2),16);
  // relative luminance (approximate WCAG)
  const luma = 0.2126*r + 0.7152*g + 0.0722*b;
  return luma < 140 ? "#fff" : "#000";
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (0 <= h && h < 60) { r = c; g = x; b = 0; }
  else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
  else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
  else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
  else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function getRandomPastelColor() {
  const h = Math.floor(Math.random() * 360);
  return hslToHex(h, 60, 85);
}


function openCreateFolderDialog() {
  const s = stateCache;
  if (!s.folderColors) s.folderColors = {};
  const randomColor = getRandomPastelColor();

  const overlay = document.createElement("div");
  overlay.className = "cgpt-modal-overlay";

  const modal = document.createElement("div");
  modal.className = "cgpt-modal";
  modal.innerHTML = `
    <h4>Create new group</h4>
    <div class="row">
      <label>
        <span style="min-width:110px">Group name:</span>
        <input type="text" id="nfName" placeholder="e.g., Notes">
      </label>
<label>
  <span style="min-width:110px">Group color:</span>
  <label class="color-ring"><input type="color" id="nfColor" value="${randomColor}"></label>
  <input type="text" id="nfColorText" value="${randomColor}" style="width:110px" />
</label>
      <div class="hint">Name must be non-empty and unique.</div>
    </div>
    <div class="actions">
      <button id="nfCreate">Create</button>
      <button id="nfCancel">Cancel</button>
    </div>
  `;
  overlay.appendChild(modal);
  shadow.appendChild(overlay);

  const nameEl = modal.querySelector("#nfName");
  const colorPicker = modal.querySelector("#nfColor");
  const colorText = modal.querySelector("#nfColorText");
  const btnCreate = modal.querySelector("#nfCreate");
  const btnCancel = modal.querySelector("#nfCancel");

  nameEl.focus();

  // sync color <-> text
  colorPicker.addEventListener("input", () => { colorText.value = colorPicker.value; });
  colorText.addEventListener("input", () => {
    const v = colorText.value.trim();
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) colorPicker.value = v;
  });

  function isValidHex(v){ return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v); }

  async function commit(){
    const name = (nameEl.value || "").trim();
    let color = (colorText.value || "").trim();
    if (!name) { alert("Group name cannot be empty."); nameEl.focus(); return; }
    if (s.folders[name]) { alert("A group with this name already exists."); nameEl.focus(); return; }
    if (!isValidHex(color)) color = randomColor;

    // create
    s.folders[name] = [];
    s.order.push(name);
    s.folderColors[name] = color;

    await setState(s);
    stateCache = await getState();
    render(panel.querySelector("#searchInput")?.value || "");

    // smooth highlight of created group
    const sec = panel.querySelector(`.folder[data-folder="${CSS.escape(name)}"]`);
    if (sec) {
      sec.scrollIntoView({ block: "center", behavior: "smooth" });
      sec.style.outline = "2px solid #fff";
      setTimeout(() => (sec.style.outline = ""), 900);
    }

    overlay.remove();
  }

  btnCreate.addEventListener("click", commit);
  btnCancel.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { e.preventDefault(); overlay.remove(); }
  });
}


  function getCurrentCanonicalUrl() {
    return normalizeUrl(getCurrentUrl());
  }

  // ---- Shadow DOM Sidebar ----
  const rootContainer = document.createElement("div");
  rootContainer.style.position = "fixed";
  rootContainer.style.top = "0";
  rootContainer.style.right = "0";
  rootContainer.style.zIndex = "2147483646";
  rootContainer.style.pointerEvents = "auto";
  document.documentElement.appendChild(rootContainer);
  const shadow = rootContainer.attachShadow({ mode: "open" });

  const wrap = document.createElement("div");
  shadow.appendChild(wrap);

  const style = document.createElement("style");

style.textContent = `
  /* ===== THEME ===== */
  :host{
    --bg:#1b1b1b;        /* panel and card background */
    --surface:#1b1b1b;   /* no longer green */
    --surface-2:#2a2a2a; /* dark buttons/fields */
    --border:#ffffff;
    --text:#ffffff;
    --text-weak:#e0f2eb;
    --accent:#ffffff;
    --shadow:rgba(0,0,0,.35);
  }

  .cgpt-panel, .cgpt-panel * { color:var(--text, #fff); }

  /* PANEL — 50px lower, does not cover the site's right scrollbar */
  .cgpt-panel{
    position:fixed; top:50px; right:16px; bottom:0; left:auto; width:360px;
    background:var(--bg, #1b1b1b) !important;
    border-left: none !important;   /* removed white stripe */
    box-shadow:-8px 0 24px var(--shadow, rgba(0,0,0,.35));
    transform:translateX(0); transition:transform .2s ease;
    pointer-events:auto; display:flex; flex-direction:column;
    font:13px/1.4 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    padding-top:0;
    padding-bottom:70px;
  }
/* shift further right for gap + shadow */
.cgpt-panel.hidden{
  transform: translateX(calc(100% + 24px)); /* 16px gap + ~8px shadow */
  box-shadow: none;                          /* remove shadow just in case */
}


  /* Header */
  .cgpt-header{
    background:var(--surface, #1b1b1b);
    padding:8px;
  }
  .cgpt-actions{
    display:grid;
    grid-template-columns: max-content 1fr max-content;
    gap:8px; align-items:center;
  }

  /* Search */
  .header-search{
    min-width:0; width:100%; box-sizing:border-box;
    padding:8px 10px;
    border-radius:10px;
    background:var(--surface-2, #2a2a2a) !important;
    color:var(--text, #fff) !important;
    border:1px solid var(--border, #ffffff) !important;
  }
  .header-search::placeholder{ color:var(--text-weak, #cfe); }

  /* Body */
  .cgpt-body{ flex:1; overflow:auto; padding:10px 10px 12px; }
  .cgpt-body::-webkit-scrollbar{ width:10px; }
  .cgpt-body::-webkit-scrollbar-track{ background:var(--bg, #1b1b1b); }
  .cgpt-body::-webkit-scrollbar-thumb{ background:var(--surface-2, #2a2a2a); border:2px solid var(--bg, #1b1b1b); border-radius:8px; }

  /* Group card */
  .folder{
    border:1px solid var(--border, #ffffff) !important; border-radius:12px;
    background:var(--surface, #1b1b1b) !important; margin-bottom:12px; overflow:hidden;
  }

  /* Group header — name + color + Add chat + Delete on one line */
  .folder-head{
    display:grid;
    grid-template-columns: minmax(0,1fr) max-content max-content max-content; /* name | color | Add | Delete */
    gap:8px; align-items:center; background:var(--surface, #1b1b1b);
    padding:8px 10px; border-bottom:1px solid var(--border, #fff) !important;
  }
  .folder-head .name-input{
    width:100%; min-width:0;
    background:transparent; border:none; outline:none;
    font-weight:700; font-size:13px; color:var(--text, #fff);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    cursor:text;
  }
/* Applies ONLY to direct input in .folder-head,
   does not touch input wrapped in .color-ring */
.folder-head > input[type="color"]{
  -webkit-appearance:none; appearance:none;
  width:16px; height:16px; padding:0; border:none; border-radius:50%;
  overflow:hidden; cursor:pointer;
}
.folder-head > input[type="color"]::-webkit-color-swatch-wrapper{ padding:0; }
.folder-head > input[type="color"]::-webkit-color-swatch{ border:none; border-radius:50%; }
.folder-head > input[type="color"]::-moz-color-swatch{ border:none; border-radius:50%; }

  /* Item list */
  .req-list{ list-style:none; margin:0; padding:8px; display:flex; flex-direction:column; gap:8px; }
  .req{
    border:1px dashed var(--border, #ffffff) !important; border-radius:10px;
    background:var(--surface-2, #2a2a2a) !important; cursor:grab; padding:8px;
  }
  .req.dragging{ opacity:.6; }
  /* Item title — full width */
  .req .title{
    font-size:12px; font-weight:600;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    width:100%;
  }
  /* Bottom row of item: Open (left, smaller), date (center, 11px), Delete (right) */
  .req .row-actions{
    margin-top:6px;
    display:grid;
    grid-template-columns: max-content 1fr max-content;
    align-items:center; gap:10px;
  }
  .open-btn{
    padding:4px 8px;          /* smaller */
    min-width:72px;           /* smaller */
    font-size:11px;           /* more compact */
    border-radius:10px;
    background:var(--surface, #1b1b1b);
    color:var(--text, #fff);
    border:1px solid var(--border, #fff);
    text-decoration:none; display:inline-block; text-align:center;
    line-height:1.2;
  }
  .date{
    font-size:11px;           /* requirement */
    color:var(--text-weak, #e0f2eb);
    text-align:center;
  }
  .del-btn{
    padding:4px 8px; min-width:48px; font-size:11px;
    border-radius:10px; background:#8a2d2d; border:1px solid var(--border, #fff); color:#fff;
    cursor:pointer;
  }

  /* Common buttons */
  button,.btn,label.like-button{
    display:inline-flex; align-items:center; justify-content:center;
    padding:8px 12px; border-radius:10px;
    background:var(--surface-2, #2a2a2a); color:var(--text, #fff);
    border:1px solid var(--border, #ffffff) !important; cursor:pointer; user-select:none; text-align:center;
    white-space:nowrap; min-width:90px; box-sizing:border-box;
  }
  button:hover,.btn:hover,label.like-button:hover{ filter:brightness(1.06); }

  /* Footer — centered; Import = Export in size and height */
  .footer{
    position:absolute; left:0; right:0; bottom:10px;
    padding:10px; background:var(--surface, #1b1b1b);
    display:flex; gap:8px; align-items:center; justify-content:center;
  }
  #importLabel{
    display:inline-flex; align-items:center; justify-content:center;
    min-width:110px; height:33px;          /* matches Export */
    padding:8px 12px;                      /* matches Export */
    border:1px solid var(--border, #ffffff) !important;
    background:var(--surface-2, #2a2a2a);
  }
  .footer #exportBtn,
  .footer #importLabel,
  .footer #clearBtn{
    min-width:110px;
  }

  .drop-target{ outline:2px dashed var(--accent, #ffffff); outline-offset:2px; }
  
  .icon-btn{
  min-width:0 !important;
  width:22px;                   /* was 28px */
  height:22px;                  /* was 28px */
  padding:0; line-height:1; font-size:14px;  /* was 16px */
  border-radius:8px;
  display:inline-flex; align-items:center; justify-content:center;
}

/* ===== MODAL STYLE (shared for rename/add) ===== */
.cgpt-modal-overlay{
  position:fixed; inset:0;
  background:rgba(0,0,0,.55);
  display:flex; align-items:center; justify-content:center;
  z-index:2147483647;
}
.cgpt-modal{
  background:#1f1f1f; color:#fff;
  border:1px solid #ffffff; border-radius:12px;
  width:min(92vw, 480px);
  padding:14px;
  box-shadow:0 16px 48px rgba(0,0,0,.45);
  font:13px/1.4 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
}
.cgpt-modal h4{ margin:0 0 10px 0; font-size:14px; }
.cgpt-modal .row{ display:flex; flex-direction:column; gap:8px; margin-bottom:10px; }
.cgpt-modal .row label{ display:flex; gap:8px; align-items:center; }
.cgpt-modal input[type="text"],
.cgpt-modal input[type="search"],
.cgpt-modal select{
  background:#2a2a2a; color:#fff;
  border:1px solid #ffffff; border-radius:10px;
  padding:8px 10px; width:100%; box-sizing:border-box;
}
.cgpt-modal select option{ background:#2a2a2a; color:#fff; }
.cgpt-modal .hint{ color:#cfd3dc; font-size:12px; }
.cgpt-modal .actions{ display:flex; gap:8px; justify-content:flex-end; margin-top:8px; }
.cgpt-modal .actions button{
  padding:8px 12px; border-radius:10px;
  background:#2a2a2a; color:#fff; border:1px solid #ffffff; min-width:100px;
}

/* color picker circle in modal — same as in header */
.cgpt-modal input[type="color"]{
  -webkit-appearance:none; appearance:none;
  width:16px; height:16px; padding:0; border:none; border-radius:50%;
  overflow:hidden; cursor:pointer;
}
.cgpt-modal input[type="color"]::-webkit-color-swatch-wrapper{ padding:0; }
.cgpt-modal input[type="color"]::-webkit-color-swatch{ border:none; border-radius:50%; }
.cgpt-modal input[type="color"]::-moz-color-swatch{ border:none; border-radius:50%; }


/* === FIX: round button opening the panel === */
.cgpt-toggle{
  position: fixed;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  
  width: 48px !important;
  height: 48px !important;
  min-width: 48px !important;     /* override general min-width:90px */
  padding: 0 !important;
  box-sizing: border-box !important;

  border-radius: 50% !important;
  border: 1px solid var(--border, #fff) !important;
  background: transparent;

  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  font-size: 22px;
  cursor: pointer;

  -webkit-appearance: none;
  appearance: none;
}
.cgpt-toggle:active { transform: translateY(-50%) scale(0.96); }

/* just in case — prevent global button rule interference */
button.cgpt-toggle{ min-width: 48px !important; }



.cgpt-panel{
  right: 16px; /* as before */
}

.folder-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px 6px 0 0;
}


/* folder name with border */
.folder-head .name-input{
  flex: 1 1 auto;
  box-sizing: border-box;
  padding: 4px 8px;
border: 1px solid currentColor !important;
  border-radius: 6px;
  background: transparent !important;     /* background from .folder-head */
  color: inherit;
  font-weight: 700;
  font-size: 14px;
}
.folder-head .name-input:focus{
  outline: none;
  border-color: #ffffff;
  box-shadow: 0 0 0 2px rgba(255,255,255,.15);
}

/* style color input separately so the general rule doesn't break it */
.folder-head input[type="color"]{
  -webkit-appearance:none; appearance:none;
  width:16px; height:16px; padding:0; border:none; border-radius:50%;
  overflow:hidden; cursor:pointer;
}
.folder-head input[type="color"]::-webkit-color-swatch-wrapper{ padding:0; }
.folder-head input[type="color"]::-webkit-color-swatch{ border:none; border-radius:50%; }
.folder-head input[type="color"]::-moz-color-swatch{ border:none; border-radius:50%; }


/* Visible circular ring, strictly square */
.color-ring{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  box-sizing:border-box;
  width:22px;
  height:22px;
  aspect-ratio: 1 / 1;        /* prevents turning into an oval */
  flex: 0 0 22px;             /* prevents stretching in flex/grid */
border: 1.5px solid currentColor; /* was #ffffff */
  border-radius:50%;          /* circle */
  padding:2px;                /* ring thickness */
  overflow:hidden;
  cursor:pointer;
  line-height:0;              /* remove line-height influence */
  color: inherit;
}

/* Colored circle inside ring fills it completely */
.color-ring input[type="color"]{
  -webkit-appearance:none; appearance:none;
  display:block;
  width:100% !important;
  height:100% !important;
  border:none !important;
  padding:0 !important;
  margin:0 !important;
  background:transparent;
  border-radius:50%;
}
.color-ring input[type="color"]::-webkit-color-swatch-wrapper{ padding:0; }
.color-ring input[type="color"]::-webkit-color-swatch{ border:none; border-radius:50%; }
.color-ring input[type="color"]::-moz-color-swatch{ border:none; border-radius:50%; }

/* hidden list of folder requests */
.req-list.collapsed { display: none; }

/* small round arrow button in header */
.collapse-btn{
  min-width: 22px !important;
  width: 22px; height: 22px;
  padding: 0; line-height: 1;
  border-radius: 50%;
  border: 1px solid var(--border,#fff);
  background: var(--surface-2,#2a2a2a);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 12px; cursor: pointer;
}
.collapse-btn:hover{ filter:brightness(1.06); }

/* when folder collapsed — round bottom of header */
.folder.collapsed .folder-head{ border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; }



/* Collapse button without borders/background, only large triangle */
.folder-head .collapse-btn{
  all: unset;                 /* remove default styles and our button rule */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 30px;            /* triangle size */
  line-height: 1;
  padding: 0;             /* small grab area for click */
  flex: 0 0 auto;
  color: inherit;             /* inherit header text color */
  border:none !important;
}
.folder-head .collapse-btn:focus{ outline: none; }
.folder-head .collapse-btn:hover{ transform: scale(1.1); }


/* visual cues during dnd */
.folder.drop-before{ box-shadow: inset 0 6px 0 0 var(--accent,#fff); }
.folder.drop-after{  box-shadow: inset 0 -6px 0 0 var(--accent,#fff); }
.folder.dragging-folder{ opacity: .6; }

.req-list.drop-target{ outline:2px dashed var(--accent,#fff); outline-offset:2px; }
.req.dragging{ opacity:.6; }


/* Empty drop zone */
.req-list{
  min-height: 4px;            /* ensure drop zone always exists */
}
.req-list.empty{
  display:block;
  padding:16px;
  min-height:24px;            /* convenient drop target */
  border:1px dashed var(--border, #ffffff);
  border-radius:10px;
  background:transparent;
  position:relative;
}
.req-list.empty::after{
  content:"Drag here";
  display:block;
  text-align:center;
  opacity:.6;
  font-size:12px;
  pointer-events:none;        /* does not intercept mouse events */
}

/* Smooth shifts when marker appears */
.req-list .req{
  transition: margin .12s ease, transform .12s ease;
}

/* Animated insertion marker */
.req-list .drop-marker{
  list-style: none;
  height: 0;
  margin: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
  transition: height .12s ease, margin .12s ease;
  position: relative;
}
.req-list .drop-marker.active{
  height: 12px;           /* gap */
  margin: 4px 0;
}
.req-list .drop-marker::after{
  content: "";
  position: absolute;
  left: 4px; right: 4px;
  top: 50%;
  transform: translateY(-50%);
  height: 2px;
  background: var(--accent, #fff);
  opacity: .8;
  border-radius: 2px;
}
.req-list.collapsed .drop-marker{ display:none; }

/* dangerous action in modal */
.cgpt-modal .actions .danger{
  background:#8a2d2d; 
  border:1px solid #ffffff !important; 
  color:#fff;
}
.cgpt-modal .actions .danger:hover{ filter:brightness(1.06); }



`;




shadow.appendChild(style);


  // Toggle button
  const toggleBtn = document.createElement("button");
  toggleBtn.className = "cgpt-toggle";
  toggleBtn.title = "ChatGPT Groups";
  toggleBtn.textContent = "📂";
  shadow.appendChild(toggleBtn);

  // Panel
  const panel = document.createElement("div");
  panel.className = "cgpt-panel hidden";
  panel.innerHTML = `
<div class="cgpt-header">
  <div class="cgpt-actions">
    <button id="addFolderBtn">New Group</button>
    <input id="searchInput" class="header-search" type="text" placeholder="Search by chat...">
    <button id="closeBtn" class="icon-btn" title="Close">✕</button>
  </div>
</div>

  <div class="cgpt-body" id="body"></div>

  <div class="footer">
    <button id="exportBtn">Export</button>
    <label class="btn like-button" id="importLabel">
      Import
      <input id="importFile" type="file" accept="application/json" style="display:none;">
    </label>
    <button id="clearBtn">Clear all</button>
  </div>
  `;
  
  shadow.appendChild(panel);
  
  // ===== helpers for DnD chats =====
function getDropIndex(ul, clientY){
  const items = Array.from(ul.querySelectorAll('.req'));
  for (let i = 0; i < items.length; i++){
    const el = items[i];
    if (el.classList.contains('dragging')) continue;
    const r = el.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    if (clientY < mid) return i;
  }
  return items.length;
}


  function openPanel() {
    panel.classList.remove("hidden");
    toggleBtn.style.display = "none";
    setOpenState(true);
  }
  function closePanel() {
    panel.classList.add("hidden");
    toggleBtn.style.display = "block";
    setOpenState(false);
  }

  let stateCache = null;
  let dragData = null;     // { type:'chat', fromFolder, fromIndex }
  let folderDrag = null;   // { fromName, fromIndex }

  // find saved "chat page" by URL across folders
  function findSavedPage(rawUrl) {
    const target = normalizeUrl(rawUrl);
    const s = stateCache;
    for (const folderName of s.order) {
      const idx = (s.folders[folderName] || []).findIndex(it => {
        if (!it) return false;
        if (it.type !== "page") return false;
        const n1 = it.nurl || normalizeUrl(it.url || "");
        return n1 === target;
      });
      if (idx !== -1) return { folderName, index: idx };
    }
    return null;
  }

  // move or create "chat page" by GIVEN URL in target folder (used by Add chat modal)
  async function moveOrInsertPageByUrl(targetFolder, rawUrl, forcedTitle) {
    if (!targetFolder || !stateCache?.folders?.[targetFolder]) return;
    const s = stateCache;
    const nurl = normalizeUrl(rawUrl);
    const title = forcedTitle || "Untitled";

    const loc = findSavedPage(rawUrl);
    if (loc && loc.folderName === targetFolder) return;

    if (loc && loc.folderName !== targetFolder) {
      const [item] = s.folders[loc.folderName].splice(loc.index, 1);
      item.ts = nowTs();
      const existsInTarget = (s.folders[targetFolder] || []).some(x => {
        if (!x || x.type !== "page") return false;
        const nn = x.nurl || normalizeUrl(x.url || "");
        return nn === nurl;
      });
      if (!existsInTarget) s.folders[targetFolder].push(item);
    } else if (!loc) {
      const exists = (s.folders[targetFolder] || []).some(x => {
        if (!x || x.type !== "page") return false;
        const nn = x.nurl || normalizeUrl(x.url || "");
        return nn === nurl;
      });
      if (!exists) {
        s.folders[targetFolder].push({
          type: "page",
          text: title,
          title,
          url: rawUrl,
          nurl,
          ts: nowTs()
        });
      }
    }

    await setState(s);
    stateCache = await getState();
    render(panel.querySelector("#searchInput").value);
  }

  function render(filterText = "") {
    const body = panel.querySelector("#body");
    body.innerHTML = "";
    const s = stateCache;
    const q = filterText.trim().toLowerCase();

    s.order.forEach((folderName) => {
      const list = s.folders[folderName] || [];
      const section = document.createElement("div");
      section.className = "folder";
      section.dataset.folder = folderName;

const head = document.createElement("div");
head.className = "folder-head";

// --- EXTERNAL drop on folder header (adds chat to end) ---
head.addEventListener("dragover", (e) => {
  if (dragData) return; // our internal DnD of chats
  const extUrl = extractUrlFromDt(e.dataTransfer);
  if (!extUrl) return;
  e.preventDefault();
  section.classList.add("drop-before"); // just highlight
  e.dataTransfer.dropEffect = "copy";
});

head.addEventListener("dragleave", () => {
  section.classList.remove("drop-before","drop-after");
});

head.addEventListener("drop", async (e) => {
  if (dragData) return;
  const extUrl = extractUrlFromDt(e.dataTransfer);
  section.classList.remove("drop-before","drop-after");
  if (!extUrl) return;

  // find title from sidebar if available
  const nurl = normalizeUrl(extUrl);
  const fromSidebar = getSidebarChats().find(x => normalizeUrl(x.url) === nurl);
  const title = fromSidebar?.title || getConversationTitleFallback();

  await moveOrInsertPageByUrl(folderName, extUrl, title);
  // soft highlight of folder
  head.style.outline = "2px solid #fff";
  setTimeout(() => head.style.outline = "", 600);
});


// --- DnD of FOLDERS (drag by .folder-head) ---
head.draggable = true;

head.addEventListener('dragstart', (e) => {
  folderDrag = { fromName: folderName, fromIndex: s.order.indexOf(folderName) };
  e.dataTransfer.effectAllowed = 'move';
  section.classList.add('dragging-folder');
});

head.addEventListener('dragend', () => {
  folderDrag = null;
  section.classList.remove('dragging-folder');
  body.querySelectorAll('.folder').forEach(el => el.classList.remove('drop-before','drop-after'));
});

// accept folder drops on the folder card
section.addEventListener('dragover', (e) => {
  if (!folderDrag || dragData) return; // don't interfere with chat dnd
  e.preventDefault();
  const rect = section.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  section.classList.toggle('drop-before', before);
  section.classList.toggle('drop-after', !before);
  e.dataTransfer.dropEffect = 'move';
});

section.addEventListener('dragleave', () => {
  if (!folderDrag) return;
  section.classList.remove('drop-before','drop-after');
});

section.addEventListener('drop', async (e) => {
  if (!folderDrag || dragData) return;
  e.preventDefault();
  section.classList.remove('drop-before','drop-after');

  const fromIdx = s.order.indexOf(folderDrag.fromName);
  const toIdxRaw = s.order.indexOf(folderName);
  const rect = section.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  let toIdx = before ? toIdxRaw : toIdxRaw + 1;

  if (fromIdx === toIdx || fromIdx + 1 === toIdx) return;

  const [moved] = s.order.splice(fromIdx, 1);
  if (fromIdx < toIdx) toIdx--; // adjust insertion index
  s.order.splice(toIdx, 0, moved);

  await setState(s);
  stateCache = await getState();
  render(panel.querySelector("#searchInput").value || "");
});


const isCollapsed = !!(s.collapsed && s.collapsed[folderName]);

if (isCollapsed) section.classList.add("collapsed");

const toggleBtn = document.createElement("button");
toggleBtn.className = "collapse-btn";
toggleBtn.title = isCollapsed ? "Expand group" : "Collapse group";
toggleBtn.textContent = isCollapsed ? "▸" : "▾";
toggleBtn.addEventListener("click", async (e) => {
  e.stopPropagation();
  if (!s.collapsed) s.collapsed = {};
  s.collapsed[folderName] = !s.collapsed[folderName];
  await setState(s);
  stateCache = await getState();
  render(q);
});


// apply group color if present
if (s.folderColors && s.folderColors[folderName]) {
  const c = s.folderColors[folderName];
  head.style.backgroundColor = c;
  head.style.color = getContrastColor(c);
}

      const nameInput = document.createElement("input");
      nameInput.className = "name-input";
      nameInput.value = folderName;
      nameInput.title = "Rename group";
      nameInput.readOnly = true;
      nameInput.style.cursor = "text";
	  nameInput.style.removeProperty("color");
      nameInput.addEventListener("click", () => openRenameFolderDialog(folderName));
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); openRenameFolderDialog(folderName); }
      });

const colorWrap = document.createElement("label");
colorWrap.className = "color-ring";

const colorBtn = document.createElement("input");
colorBtn.type = "color";
colorBtn.title = "Choose group color";

// 🔹 ADD THESE TWO LINES:
const currentColor = (s.folderColors && s.folderColors[folderName]) || "#444444";
colorBtn.value = currentColor;

colorBtn.addEventListener("input", async (e) => {
  const color = e.target.value;
  if (!s.folderColors) s.folderColors = {};
  s.folderColors[folderName] = color;

  head.style.backgroundColor = color;
  head.style.color = getContrastColor(color); // name inherits

  await setState(s);
  stateCache = await getState();
});


colorWrap.appendChild(colorBtn);


      const addBtn = document.createElement("button");
      addBtn.textContent = "Add chat";
      addBtn.addEventListener("click", () => openAddRequestDialog(folderName));

// --- Replace old "Delete" button block with this ---
const actionBtn = document.createElement("button");
actionBtn.className = "del-btn";

// helper to (re)label button by current state
function relabel() {
  const len = (s.folders[folderName] || []).length;
  if (len > 0) {
    actionBtn.textContent = "Clear";
    actionBtn.title = "Remove all chats from this group";
  } else {
    actionBtn.textContent = "Delete";
    actionBtn.title = "Delete empty group";
  }
}
relabel();

actionBtn.addEventListener("click", async () => {
  const len = (s.folders[folderName] || []).length;

  if (len > 0) {
    // CLEAR CHATS (styled dialog)
    const ok = await openConfirmDialog({
      title: "Clear all chats",
      message: `Remove all chats from “${folderName}”?`,
      confirmText: "Clear",
      cancelText: "Cancel",
      danger: true
    });
    if (!ok) return;

    s.folders[folderName] = [];
    await setState(s);
    stateCache = await getState();
    render(q);   // relabel -> "Delete"
  } else {
    // DELETE EMPTY GROUP (styled dialog)
    const ok = await openConfirmDialog({
      title: "Delete group",
      message: `Delete empty group “${folderName}”?`,
      confirmText: "Delete",
      cancelText: "Cancel",
      danger: true
    });
    if (!ok) return;

    delete s.folders[folderName];
    s.order = s.order.filter((x) => x !== folderName);
    await setState(s);
    stateCache = await getState();
    render(q);
  }
});
// --- end replace ---

	  
head.appendChild(toggleBtn);
      head.appendChild(nameInput);
 head.appendChild(colorWrap);
      head.appendChild(addBtn);
      head.appendChild(actionBtn);
      section.appendChild(head);

const ul = document.createElement("ul");
ul.className = "req-list";
ul.dataset.folder = folderName;
if (isCollapsed) ul.classList.add("collapsed");

// ===== helper: insertion index in FULL folder array considering filter =====
function getDropIndexFull(ul, clientY) {
  const destFolder = ul.dataset.folder;
  const full = s.folders[destFolder] || [];

  const items = Array.from(ul.querySelectorAll(".req"))
    .filter(el => !el.classList.contains("dragging"));

  if (items.length === 0) return full.length;

  // compute vidx insertion point by card center
  let visIndex = items.length;
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect();
    const mid = r.top + r.height / 2;
    if (clientY < mid) { visIndex = i; break; }
  }

  // show marker exactly here (visual)
  showMarkerAt(ul, visIndex);

  // convert visible index to full array index
  const fullIndexes = items.map(el => Number(el.dataset.fullIndex));
  if (visIndex === items.length) {
    const after = fullIndexes[fullIndexes.length - 1] + 1;
    return Math.min(after, full.length);
  } else {
    return fullIndexes[visIndex];
  }
}


// One marker per ul: create on demand and reuse
function ensureMarker(ul){
  if (!ul._marker){
    const m = document.createElement('li');
    m.className = 'drop-marker';
    ul._marker = m;
  }
  return ul._marker;
}

// Show marker before visible element with index visIndex (or at end)
function showMarkerAt(ul, visIndex){
  const marker = ensureMarker(ul);
  if (!marker.isConnected) ul.appendChild(marker);

  // collect visible li excluding marker and dragged element
  const items = Array.from(ul.querySelectorAll('.req'))
    .filter(el => !el.classList.contains('dragging'));

  if (items.length === 0 || visIndex >= items.length){
    ul.appendChild(marker);
  } else {
    ul.insertBefore(marker, items[visIndex]);
  }
  // smoothly expand
  marker.classList.add('active');
}

// Hide marker
function hideMarker(ul){
  if (ul?._marker){
    ul._marker.classList.remove('active');
    // remove from DOM later so animation collapses
    const mm = ul._marker;
    setTimeout(() => { if (mm.isConnected && !mm.classList.contains('active')) mm.remove(); }, 150);
  }
}


// ===== DnD ON LIST (once, outside loop over li) =====
ul.addEventListener("dragover", (e) => {
  if (isCollapsed) return;

  const isInternal = !!dragData && dragData.type === "chat";
  const extUrl = isInternal ? "" : extractUrlFromDt(e.dataTransfer);
  if (!isInternal && !extUrl) return;

  e.preventDefault();
  ul.classList.add("drop-target");
  e.dataTransfer.dropEffect = isInternal ? "move" : "copy";

  // show marker of insertion spot (uses 's' from render)
  getDropIndexFull(ul, e.clientY);
});

ul.addEventListener("dragleave", (e) => {
  const rect = ul.getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
    ul.classList.remove("drop-target");
    hideMarker(ul);
  }
});

ul.addEventListener("drop", async (e) => {
  if (isCollapsed) return;

  const isInternal = !!dragData && dragData.type === "chat";
  ul.classList.remove("drop-target");

  // ==== internal DnD (between/within groups) ====
  if (isInternal) {
    e.preventDefault();
    const toFolder = ul.dataset.folder;
    const { fromFolder, fromIndex } = dragData;

    const src = s.folders[fromFolder];      // ← 's' from render
    const dst = s.folders[toFolder];

    const [moved] = src.splice(fromIndex, 1);
    if (!moved) { hideMarker(ul); return; }

    const dropIndexFull = getDropIndexFull(ul, e.clientY);

    if (fromFolder === toFolder) {
      const insertIdx = fromIndex < dropIndexFull ? dropIndexFull - 1 : dropIndexFull;
      dst.splice(insertIdx, 0, moved);
    } else {
      dst.splice(Math.min(dropIndexFull, dst.length), 0, moved);
    }

    await setState(s);
    stateCache = await getState();
    hideMarker(ul);
    render(panel.querySelector("#searchInput").value || "");
    return;
  }

  // ==== external DnD (link dragged from sidebar) ====
  const extUrl = extractUrlFromDt(e.dataTransfer);
  hideMarker(ul);
  if (!extUrl) return;

  e.preventDefault();
  const toFolder = ul.dataset.folder;
  const nurl = normalizeUrl(extUrl);

  const fromSidebar = getSidebarChats().find(x => normalizeUrl(x.url) === nurl);
  const title = fromSidebar?.title || getConversationTitleFallback();

  const dst = s.folders[toFolder];
  const dropIndexFull = getDropIndexFull(ul, e.clientY);

  const existingLoc = findSavedPage(extUrl);
  let item;
  if (existingLoc) {
    const [moved] = s.folders[existingLoc.folderName].splice(existingLoc.index, 1);
    item = moved || null;
  } else {
    item = { type: "page", text: title, title, url: extUrl, nurl, ts: nowTs() };
  }

  const dup = dst.some(x => x?.type === "page" && (x.nurl || normalizeUrl(x.url||"")) === nurl);
  if (!dup && item) {
    dst.splice(Math.min(dropIndexFull, dst.length), 0, item);
    await setState(s);
    stateCache = await getState();
    render(panel.querySelector("#searchInput").value || "");
  }
});


// ===== compute list of visible items (for render) =====
const fullList = list;
const visible = q
  ? fullList.filter((it) => (it?.text || it?.title || "").toLowerCase().includes(q))
  : fullList;

// Empty drop area
if (!isCollapsed && visible.length === 0) {
  ul.classList.add("empty");
} else {
  ul.classList.remove("empty");
}

// ===== elements =====
visible.forEach((item, idxVis) => {
  const li = document.createElement("li");
  li.className = "req";
  li.draggable = true;

  // Index of THIS item in the FULL array of the group
  const fullIdx = idxFromFiltered(visible, fullList, q, idxVis);
  li.dataset.fullIndex = String(fullIdx);   // — used above in getDropIndexFull

  // ---- element DnD ----
  li.addEventListener("dragstart", (e) => {
    dragData = { type: "chat", fromFolder: folderName, fromIndex: fullIdx };
    li.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
li.addEventListener("dragend", () => {
  dragData = null;
  li.classList.remove("dragging");
  panel.querySelectorAll(".req-list").forEach(ulEl => {
    ulEl.classList.remove("drop-target");
    hideMarker(ulEl);
  });
});


// ---- content ----
const titleSafe = (item && (item.text || item.title)) || "(untitled)";
const dateSafe  = (item && item.ts) ? fmtDate(item.ts) : "";
const urlSafe   = item?.url || item?.nurl || "#";

li.innerHTML = `
  <div class="title">${titleSafe}</div>
  <div class="row-actions">
    <a class="open-btn" href="${urlSafe}" target="_blank" rel="noopener">Open chat</a>
    <span class="date">${dateSafe}</span>
    <button class="del-btn" data-act="del">Delete</button>
  </div>
`;

// to avoid link click conflicting with dnd
const openA = li.querySelector(".open-btn");
openA.draggable = false; // otherwise sometimes drags li
openA.addEventListener("mousedown", e => e.stopPropagation());

// open in this tab with normal click; new tab with Ctrl/Cmd/middle click
openA.addEventListener("click", (e) => {
  const url = item?.url || item?.nurl;
  if (!url) return;

  // if user chose new tab (Ctrl/Cmd/middle) let browser handle
  if (e.metaKey || e.ctrlKey || e.button === 1) return;

  // otherwise open in same tab
  e.preventDefault();
  location.href = url;
});


  // deletion
  li.querySelector('[data-act="del"]').addEventListener("click", async () => {
  const trueFullIdx = idxFromFiltered(visible, s.folders[folderName], q, idxVis);
  s.folders[folderName].splice(trueFullIdx, 1);
  await setState(s);
  stateCache = await getState();
  render(q);
});


  ul.appendChild(li);
});


      section.appendChild(ul);
      body.appendChild(section);
    });
  }

  function idxFromFiltered(filteredArr, fullArr, q, idxInFiltered) {
    if (!q) return idxInFiltered;
    const needle = filteredArr[idxInFiltered];
    const fullIdx = fullArr.findIndex((x) => x === needle);
    return fullIdx === -1 ? idxInFiltered : fullIdx;
  }

  // ---- Events ----
  toggleBtn.addEventListener("click", openPanel);
  panel.querySelector("#closeBtn").addEventListener("click", closePanel);

  // Create folder
panel.querySelector("#addFolderBtn").addEventListener("click", () => {
  openCreateFolderDialog();
});

  // Search
  panel.querySelector("#searchInput").addEventListener("input", (e) => {
    render(e.target.value);
  });

  // Export
  panel.querySelector("#exportBtn").addEventListener("click", async () => {
    const s = await getState();
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chatgpt_groups_export.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import
  panel.querySelector("#importFile").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    try {
      const json = JSON.parse(text);
      if (!json || !json.folders || !json.order) throw new Error("bad schema");
      await setState(json);
      stateCache = await getState();
      render(panel.querySelector("#searchInput").value);
      alert("Import complete");
    } catch (err) {
      alert("Invalid file format.");
    } finally {
      e.target.value = "";
    }
  });

  // Clear all
panel.querySelector("#clearBtn").addEventListener("click", async () => {
  const ok = await openConfirmDialog({
    title: "Clear everything",
    message: "Delete all groups and chats? This cannot be undone.",
    confirmText: "Clear all",
    cancelText: "Cancel",
    danger: true
  });
  if (!ok) return;

  await setState({ folders: {}, order: [] });
  stateCache = await getState();
  render(panel.querySelector("#searchInput").value);
});


  // ---- Init ----
  (async () => {
    stateCache = await getState();
    render();

    const wasOpen = await getOpenState();
    if (wasOpen) {
      openPanel();
    } else {
      closePanel();
    }
  })();

})();
