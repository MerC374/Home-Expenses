const OWNER_PIN = "1234"; // change this before giving the link to anyone

// ---- Firebase Realtime Database ----
// Replace with your own project's URL: Firebase console → Realtime Database → copy the URL shown at the top.
// It looks like: https://your-project-id-default-rtdb.firebaseio.com
const FIREBASE_URL = "https://home-expenses-8d474-default-rtdb.firebaseio.com";

const CATALOG = {
  "Vegetables": ["Potato (Aloo)","Onion (Pyaz)","Tomato","Ginger-Garlic","Green Chili","Spinach (Palak)","Cauliflower","Cabbage","Capsicum","Cucumber","Lady Finger (Bhindi)"],
  "Fruits": ["Banana","Apple","Papaya","Orange","Mango","Grapes"],
  "Dairy & Eggs": ["Milk","Curd (Dahi)","Paneer","Butter","Eggs","Ghee"],
  "Grains & Pulses": ["Rice","Wheat Flour (Atta)","Toor Dal","Moong Dal","Chana","Sugar","Salt"],
  "Spices & Condiments": ["Turmeric","Red Chili Powder","Coriander Powder","Garam Masala","Cumin","Mustard Oil","Cooking Oil","Tea Leaves"],
  "Bakery & Snacks": ["Bread","Biscuits","Namkeen"],
  "Others": []
};
const CATEGORIES = Object.keys(CATALOG);
const STORAGE_KEY = "grocery-entries";
let entries = [];
let helpers = [];
let activeFilter = "All";
let role = null; // 'owner' | 'helper'
let currentHelper = null; // name string when role === 'helper'
let storageOk = true;

function todayStr(){ return new Date().toISOString().slice(0,10); }
function fmtMoney(n){ return "₹" + Math.round(n||0).toLocaleString('en-IN'); }
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}
function showBanner(msg){
  document.getElementById('bannerArea').innerHTML =
    `<div class="banner"><span>${msg}</span><button class="icon-btn" onclick="document.getElementById('bannerArea').innerHTML=''">Dismiss</button></div>`;
}

/* ---------- ROLE GATE ---------- */
document.getElementById('ownerGateBtn').addEventListener('click', ()=>{
  document.getElementById('pinBox').classList.add('open');
});
document.getElementById('pinSubmit').addEventListener('click', tryPin);
document.getElementById('pinInput').addEventListener('keydown', e=>{ if(e.key==='Enter') tryPin(); });
function tryPin(){
  const val = document.getElementById('pinInput').value;
  if(val === OWNER_PIN){ enterApp('owner'); }
  else { document.getElementById('pinError').textContent = "Wrong PIN — try again"; }
}
document.getElementById('helperGateBtn').addEventListener('click', async ()=>{
  await loadHelpers();
  const sel = document.getElementById('helperNameSelect');
  if(helpers.length===0){
    document.getElementById('helperNameError').textContent = "No helpers set up yet — ask the owner to add your name first.";
    return;
  }
  sel.innerHTML = helpers.map(h=>`<option value="${h.name}">${h.name}</option>`).join('');
  document.getElementById('helperNameBox').classList.add('open');
  document.getElementById('helperNameBox2').classList.add('open');
});
document.getElementById('helperNameSubmit').addEventListener('click', tryHelperPin);
document.getElementById('helperPinInput').addEventListener('keydown', e=>{ if(e.key==='Enter') tryHelperPin(); });
function tryHelperPin(){
  const name = document.getElementById('helperNameSelect').value;
  const pin = document.getElementById('helperPinInput').value;
  const match = helpers.find(h=>h.name===name);
  if(!match){ document.getElementById('helperNameError').textContent = "Select your name first"; return; }
  if(match.pin && match.pin !== pin){
    document.getElementById('helperNameError').textContent = "Wrong PIN — try again";
    return;
  }
  currentHelper = name;
  enterApp('helper');
}

async function enterApp(r){
  role = r;
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.querySelectorAll('.owner-only').forEach(el=> el.style.display = role==='owner' ? '' : 'none');
  document.getElementById('switchRoleBtn').textContent = role==='owner' ? 'Owner · switch' : `${currentHelper} · switch`;
  document.getElementById('switchRoleBtn').onclick = ()=>{
    role = null; currentHelper = null;
    document.getElementById('app').classList.add('hidden');
    document.getElementById('gate').classList.remove('hidden');
    document.getElementById('pinBox').classList.remove('open');
    document.getElementById('helperNameBox').classList.remove('open');
    document.getElementById('helperNameBox2').classList.remove('open');
    document.getElementById('pinInput').value='';
    document.getElementById('pinError').textContent='';
    document.getElementById('helperNameError').textContent='';
    document.getElementById('helperPinInput').value='';
  };
  initSelectors();
  if(role==='owner') await loadHelpers();
  renderHelperChips();
  populateAssignSelect();
  await loadEntries();
  renderToday();
}

/* ---------- SETUP ---------- */
function initSelectors(){
  const catSelect = document.getElementById('catSelect');
  catSelect.innerHTML = CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('');
  catSelect.addEventListener('change', refreshSuggestions);
  refreshSuggestions();
  document.getElementById('dateLabel').textContent =
    "Today — " + new Date().toLocaleDateString('en-IN', {weekday:'long', day:'numeric', month:'long'});
}
function refreshSuggestions(){
  const cat = document.getElementById('catSelect').value;
  const dl = document.getElementById('itemSuggestions');
  dl.innerHTML = (CATALOG[cat]||[]).map(i=>`<option value="${i}">`).join('');
}

/* ---------- STORAGE (Firebase Realtime Database, plain REST) ---------- */
async function loadEntries(){
  try{
    const res = await fetch(`${FIREBASE_URL}/entries.json`);
    if(!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    entries = data ? Object.values(data) : [];
    storageOk = true;
  }catch(e){
    entries = [];
    storageOk = false;
    showBanner("Couldn't load today's list — check your internet connection, or the site isn't connected to a database yet.");
  }
}
async function saveEntries(){
  try{
    const asObject = entries.reduce((acc,e)=>{ acc[e.id]=e; return acc; }, {});
    const res = await fetch(`${FIREBASE_URL}/entries.json`, {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(asObject)
    });
    if(!res.ok) throw new Error('save failed');
    storageOk = true;
  }catch(e){
    storageOk = false;
    showBanner("Couldn't save your last change — check your connection and try again.");
  }
}

async function loadHelpers(){
  try{
    const res = await fetch(`${FIREBASE_URL}/helpers.json`);
    if(!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    let raw = Array.isArray(data) ? data.filter(Boolean) : (data ? Object.values(data) : []);
    // migrate any old plain-string helper entries to {name, pin} shape
    helpers = raw.map(h => typeof h === 'string' ? {name: h, pin: ''} : h);
  }catch(e){
    helpers = [];
  }
}
async function saveHelpers(){
  try{
    await fetch(`${FIREBASE_URL}/helpers.json`, {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(helpers)
    });
  }catch(e){
    showBanner("Couldn't save the helper list — check your connection.");
  }
}

function renderHelperChips(){
  const el = document.getElementById('helperChipList');
  if(!el) return;
  el.innerHTML = helpers.length
    ? helpers.map(h=>`<span class="chip active" style="cursor:default;">${h.name}${h.pin ? ' 🔒' : ''} <button class="icon-btn del-helper-btn" data-name="${h.name}" style="margin-left:4px;padding:1px 5px;">×</button></span>`).join('')
    : `<span class="small" style="color:var(--ink-soft);">No helpers added yet.</span>`;
  el.querySelectorAll('.del-helper-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      helpers = helpers.filter(h=>h.name!==btn.dataset.name);
      await saveHelpers();
      renderHelperChips();
      populateAssignSelect();
    });
  });
}

function populateAssignSelect(){
  const sel = document.getElementById('assignSelect');
  if(!sel) return;
  sel.innerHTML = `<option value="">Anyone (unassigned)</option>` +
    helpers.map(h=>`<option value="${h.name}">${h.name}</option>`).join('');
}

document.getElementById('addHelperBtn')?.addEventListener('click', async ()=>{
  const nameInput = document.getElementById('newHelperInput');
  const pinInput = document.getElementById('newHelperPin');
  const name = nameInput.value.trim();
  const pin = pinInput.value.trim();
  if(!name){ showToast("Enter a name first"); return; }
  if(helpers.some(h=>h.name===name)){ showToast("Already added"); return; }
  if(!pin || pin.length<4){ showToast("Set a 4+ digit PIN for this helper"); return; }
  helpers.push({name, pin});
  nameInput.value = ''; pinInput.value = '';
  await saveHelpers();
  renderHelperChips();
  populateAssignSelect();
});

/* ---------- ADD ITEM (owner) ---------- */
function addItem(){
  const cat = document.getElementById('catSelect').value;
  const name = document.getElementById('itemInput').value.trim();
  const qty = document.getElementById('qtyInput').value;
  const unit = document.getElementById('unitSelect').value;
  const assignedTo = document.getElementById('assignSelect').value;
  if(!name){ showToast("Enter an item name first"); return; }
  entries.push({
    id: 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
    date: todayStr(), category: cat, name: name, qtyNeeded: qty || '', unit: unit,
    status: 'pending', weight: null, rate: null, amount: null, location: null,
    assignedTo: assignedTo || ''
  });
  document.getElementById('itemInput').value='';
  document.getElementById('qtyInput').value='';
  saveEntries();
  renderToday();
}
document.getElementById('addBtn').addEventListener('click', addItem);
document.getElementById('itemInput').addEventListener('keydown', e=>{ if(e.key==='Enter') addItem(); });

/* ---------- TODAY VIEW ---------- */
function renderFilterChips(){
  const el = document.getElementById('filterChips');
  const opts = ['All', ...CATEGORIES, 'Pending', 'Purchased'];
  el.innerHTML = opts.map(o=>`<button class="chip ${activeFilter===o?'active':''}" data-filter="${o}">${o}</button>`).join('');
  el.querySelectorAll('.chip').forEach(c=>{
    c.addEventListener('click', ()=>{ activeFilter = c.dataset.filter; renderToday(); });
  });
}

function renderToday(){
  renderFilterChips();
  let todays = entries.filter(e=>e.date===todayStr());
  if(role==='helper'){
    todays = todays.filter(e=> !e.assignedTo || e.assignedTo===currentHelper);
  }
  let filtered = todays;
  if(activeFilter==='Pending') filtered = todays.filter(e=>e.status==='pending');
  else if(activeFilter==='Purchased') filtered = todays.filter(e=>e.status==='purchased');
  else if(activeFilter!=='All') filtered = todays.filter(e=>e.category===activeFilter);

  const container = document.getElementById('listContainer');
  if(filtered.length===0){
    container.innerHTML = `<div class="empty">${todays.length===0 ? "No items yet — " + (role==='owner' ? "add something above." : "ask the owner to add today's list.") : "Nothing matches this filter."}</div>`;
  } else {
    const byCat = {};
    filtered.forEach(e=>{ (byCat[e.category] = byCat[e.category]||[]).push(e); });
    container.innerHTML = Object.keys(byCat).map(cat=>`
      <div class="cat-group">
        <div class="cat-title">${cat}</div>
        ${byCat[cat].map(e=>renderItemRow(e)).join('')}
      </div>`).join('');
  }
  attachRowHandlers();

  const pending = todays.filter(e=>e.status==='pending').length;
  const done = todays.filter(e=>e.status==='purchased');
  const total = done.reduce((s,e)=>s+(e.amount||0),0);
  document.getElementById('pendingCount').textContent = `${pending} pending`;
  document.getElementById('doneCount').textContent = `${done.length} purchased`;
  document.getElementById('todayTotal').textContent = fmtMoney(total);
}

function renderItemRow(e){
  const isDone = e.status==='purchased';
  const locLink = e.location ? `<a class="pin" href="https://maps.google.com/?q=${e.location.lat},${e.location.lng}" target="_blank" rel="noopener">📍 map</a>` : '';
  const ownerActions = role==='owner' ? `<button class="icon-btn edit-btn">Edit</button><button class="btn-danger del-btn">Delete</button>` : '';
  const assignBadge = e.assignedTo ? `<span class="pin" style="border-color:var(--mustard-soft);color:var(--mustard);">${e.assignedTo}</span>` : '';
  return `
    <div class="item-block" data-id="${e.id}">
      <div class="item">
        <div>
          <div class="item-name">${e.name}</div>
          <div class="item-need">${e.qtyNeeded ? e.qtyNeeded+' '+e.unit+' needed' : e.unit} ${role==='owner' && assignBadge ? assignBadge : ''}</div>
        </div>
        <div class="item-right">
          ${isDone
            ? `<span class="amt">${fmtMoney(e.amount)}</span> ${locLink} <span class="status-pill pill-done">done</span> ${ownerActions}`
            : `<span class="status-pill pill-pending">pending</span><button class="btn-ghost mark-btn">Mark bought</button> ${ownerActions}`
          }
        </div>
      </div>
      <div class="purchase-form" id="form-${e.id}">
        <div class="row">
          <div class="field"><label class="small">Weight/qty bought</label><input type="number" step="0.01" class="pf-weight" value="${e.weight ?? ''}" placeholder="e.g. 1.2"></div>
          <div class="field"><label class="small">Rate (₹ per ${e.unit})</label><input type="number" step="0.01" class="pf-rate" value="${e.rate ?? ''}" placeholder="e.g. 40"></div>
        </div>
        <div class="row" style="align-items:center;">
          <button class="btn-primary confirm-btn">${isDone ? 'Save changes' : 'Confirm purchase'}</button>
          <button class="btn-ghost loc-btn" type="button">📍 Tag location</button>
          <span class="small loc-status"></span>
        </div>
      </div>
    </div>`;
}

function attachRowHandlers(){
  document.querySelectorAll('.mark-btn, .edit-btn').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      const block = ev.target.closest('.item-block');
      block.querySelector('.purchase-form').classList.toggle('open');
    });
  });
  document.querySelectorAll('.del-btn').forEach(btn=>{
    btn.addEventListener('click', async (ev)=>{
      const id = ev.target.closest('.item-block').dataset.id;
      const item = entries.find(e=>e.id===id);
      if(!confirm(`Delete "${item.name}" from today's list?`)) return;
      entries = entries.filter(e=>e.id!==id);
      await saveEntries();
      renderToday();
      showToast("Item deleted");
    });
  });
  document.querySelectorAll('.loc-btn').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      const block = ev.target.closest('.item-block');
      const status = block.querySelector('.loc-status');
      if(!navigator.geolocation){ status.textContent='Location not supported on this device'; return; }
      status.textContent = 'Locating...';
      navigator.geolocation.getCurrentPosition(
        pos=>{
          block.dataset.lat = pos.coords.latitude;
          block.dataset.lng = pos.coords.longitude;
          status.textContent = 'Location tagged ✓';
        },
        err=>{
          status.textContent = err.code === 1
            ? 'Location permission denied — you can still confirm without it'
            : 'Could not get location — you can still confirm without it';
        },
        {timeout:8000}
      );
    });
  });
  document.querySelectorAll('.confirm-btn').forEach(btn=>{
    btn.addEventListener('click', async (ev)=>{
      const block = ev.target.closest('.item-block');
      const id = block.dataset.id;
      const weight = parseFloat(block.querySelector('.pf-weight').value);
      const rate = parseFloat(block.querySelector('.pf-rate').value);
      if(!weight || weight<=0){ showToast("Enter a valid weight/quantity"); return; }
      if(!rate || rate<=0){ showToast("Enter a valid rate"); return; }
      const entry = entries.find(e=>e.id===id);
      entry.weight = weight; entry.rate = rate; entry.amount = weight * rate; entry.status = 'purchased';
      if(block.dataset.lat){ entry.location = { lat: block.dataset.lat, lng: block.dataset.lng }; }
      await saveEntries();
      renderToday();
      showToast(`${entry.name} saved`);
    });
  });
}

/* ---------- WEEK / MONTH VIEWS ---------- */
function rangeEntries(days){
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate()-(days-1));
  const cutoffStr = cutoff.toISOString().slice(0,10);
  return entries.filter(e=>e.status==='purchased' && e.date>=cutoffStr);
}

function renderRangeView(containerId, rangeEntriesList, label){
  const byCat = {};
  rangeEntriesList.forEach(e=>{
    byCat[e.category] = byCat[e.category] || {count:0, total:0};
    byCat[e.category].count++; byCat[e.category].total += (e.amount||0);
  });
  const grandTotal = rangeEntriesList.reduce((s,e)=>s+(e.amount||0),0);
  const catKeys = Object.keys(byCat).sort((a,b)=>byCat[b].total-byCat[a].total);

  const breakdown = catKeys.length ? catKeys.map(c=>{
    const pct = grandTotal ? Math.round((byCat[c].total/grandTotal)*100) : 0;
    return `
      <div class="week-cat">
        <div style="flex:1;">
          <div class="week-cat-name">${c}</div>
          <div class="week-cat-count">${byCat[c].count} item${byCat[c].count>1?'s':''}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="amt" style="margin-left:10px;">${fmtMoney(byCat[c].total)}</div>
      </div>`;
  }).join('') : `<div class="empty">No purchases logged for ${label} yet.</div>`;

  const sorted = [...rangeEntriesList].sort((a,b)=>b.date.localeCompare(a.date));
  const log = sorted.length ? sorted.map(e=>{
    const locLink = e.location ? `<a class="pin" href="https://maps.google.com/?q=${e.location.lat},${e.location.lng}" target="_blank" rel="noopener">📍</a>` : '';
    return `
      <div class="log-entry">
        <div class="log-left">
          <div>${e.name} <span style="color:var(--ink-soft)">— ${e.weight}${e.unit} × ${fmtMoney(e.rate)}</span></div>
          <div class="log-date">${e.date} · ${e.category} ${locLink}</div>
        </div>
        <div class="amt">${fmtMoney(e.amount)}</div>
      </div>`;
  }).join('') : `<div class="empty">Nothing purchased yet.</div>`;

  document.getElementById(containerId).innerHTML = `
    <div class="card">
      <h2>${label} — by category</h2>
      ${breakdown}
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="margin:0;">Purchase log</h2>
        ${role==='owner' ? `<button class="btn-ghost export-btn" data-range="${containerId}">Export CSV</button>` : ''}
      </div>
      ${log}
    </div>
    <div class="receipt">
      <div class="receipt-row"><span>${rangeEntriesList.length} items purchased</span><span></span></div>
      <div class="receipt-total"><span>${label} total</span><span>${fmtMoney(grandTotal)}</span></div>
    </div>`;

  const exportBtn = document.querySelector(`#${containerId} .export-btn`);
  if(exportBtn){
    exportBtn.addEventListener('click', ()=> exportCSV(rangeEntriesList, label));
  }
}

function exportCSV(list, label){
  if(list.length===0){ showToast("Nothing to export yet"); return; }
  const header = "Date,Category,Item,Weight,Unit,Rate,Amount,Location\n";
  const rows = list.map(e=>{
    const loc = e.location ? `${e.location.lat} ${e.location.lng}` : '';
    return [e.date, e.category, e.name, e.weight, e.unit, e.rate, e.amount, loc].join(',');
  }).join('\n');
  const blob = new Blob([header+rows], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `grocery-${label.toLowerCase().replace(/\s+/g,'-')}-${todayStr()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("CSV downloaded");
}

/* ---------- TABS ---------- */
document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    const which = tab.dataset.tab;
    document.getElementById('tab-today').style.display = which==='today' ? 'block' : 'none';
    document.getElementById('tab-week').style.display = which==='week' ? 'block' : 'none';
    document.getElementById('tab-month').style.display = which==='month' ? 'block' : 'none';
    if(which==='week') renderRangeView('tab-week', rangeEntries(7), 'This week');
    if(which==='month') renderRangeView('tab-month', rangeEntries(30), 'This month');
  });
});
