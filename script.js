// ---- Firebase ----
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Get this from: Firebase console → gear icon (top left) → Project settings →
// scroll to "Your apps" → if none exists, click the </> (web) icon to create one → copy the config object shown.
const firebaseConfig = {
  apiKey: "AIzaSyBoih0iSrG58egz3d94RgGA3-4DX1u4JII",
  authDomain: "home-expenses-8d474.firebaseapp.com",
  databaseURL: "https://home-expenses-8d474-default-rtdb.firebaseio.com",
  projectId: "home-expenses-8d474",
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const FIREBASE_URL_RAW = firebaseConfig.databaseURL;
const FIREBASE_URL = FIREBASE_URL_RAW.replace(/\/+$/, ''); // strips any trailing slash so /entries.json always joins cleanly

// Realtime Database (existing grocery data) now authorizes using the real signed-in user's ID token,
// AND scopes every path under that user's own uid — so person A's grocery list never mixes with person B's.
async function authedUrl(path){
  const user = auth.currentUser;
  if(!user) return null;
  const token = await user.getIdToken();
  return `${FIREBASE_URL}/${path}/${user.uid}.json?auth=${token}`;
}

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
let entries = [];
let activeFilter = "All";
let role = null;       // 'owner' | 'user'  — comes from the user's Firestore profile, never chosen by the person themselves
let currentProfile = null; // { uid, name, email, role }
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

/* ---------- AUTH: SIGN UP / LOG IN ---------- */
document.getElementById('showSignup').addEventListener('click', (e)=>{
  e.preventDefault();
  document.getElementById('loginForm').style.display='none';
  document.getElementById('signupForm').style.display='block';
  document.getElementById('authSubtitle').textContent = 'Create your account';
});
document.getElementById('showLogin').addEventListener('click', (e)=>{
  e.preventDefault();
  document.getElementById('signupForm').style.display='none';
  document.getElementById('loginForm').style.display='block';
  document.getElementById('authSubtitle').textContent = 'Log in to your account';
});
document.getElementById('showForgot').addEventListener('click', (e)=>{
  e.preventDefault();
  document.getElementById('loginForm').style.display='none';
  document.getElementById('forgotForm').style.display='block';
  document.getElementById('authSubtitle').textContent = 'Reset your password';
});
document.getElementById('backToLoginFromForgot').addEventListener('click', (e)=>{
  e.preventDefault();
  document.getElementById('forgotForm').style.display='none';
  document.getElementById('loginForm').style.display='block';
  document.getElementById('authSubtitle').textContent = 'Log in to your account';
});
document.getElementById('forgotBtn').addEventListener('click', async ()=>{
  const email = document.getElementById('forgotEmail').value.trim();
  const msgEl = document.getElementById('forgotMessage');
  msgEl.style.color = 'var(--ink-soft)';
  if(!email){ msgEl.style.color='var(--rust)'; msgEl.textContent = 'Enter your email first'; return; }
  try{
    await sendPasswordResetEmail(auth, email);
    msgEl.style.color = 'var(--green)';
    msgEl.textContent = "If that email has an account, a reset link is on its way — check your inbox (and spam folder).";
  }catch(e){
    // Deliberately vague on purpose: confirming "no account exists" for an email is a privacy leak.
    msgEl.style.color = 'var(--green)';
    msgEl.textContent = "If that email has an account, a reset link is on its way — check your inbox (and spam folder).";
  }
});

document.getElementById('loginBtn').addEventListener('click', async ()=>{
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  if(!email || !password){ errEl.textContent = 'Enter both email and password'; return; }
  try{
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged below picks up the rest
  }catch(e){
    errEl.textContent = e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found'
      ? 'Wrong email or password'
      : 'Could not log in — ' + e.message;
  }
});

document.getElementById('signupBtn').addEventListener('click', async ()=>{
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const errEl = document.getElementById('signupError');
  errEl.textContent = '';
  if(!name){ errEl.textContent = 'Enter your name'; return; }
  if(!email || !password){ errEl.textContent = 'Enter both email and password'; return; }
  if(password.length < 6){ errEl.textContent = 'Password must be at least 6 characters'; return; }
  try{
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Everyone signs up as a regular user. There's no global "owner" — on a social platform,
    // anyone can act as the task-giver in their own connections, and as a helper in someone else's.
    // Password itself is never stored anywhere by us — Firebase Auth handles hashing and storage.
    await setDoc(doc(db, 'users', cred.user.uid), {
      uid: cred.user.uid, name, email, role: 'user', createdAt: serverTimestamp()
    });
    // onAuthStateChanged below picks up the rest
  }catch(e){
    errEl.textContent = e.code === 'auth/email-already-in-use'
      ? 'An account with this email already exists'
      : 'Could not create account — ' + e.message;
  }
});

onAuthStateChanged(auth, async (user)=>{
  if(!user){
    role = null; currentProfile = null;
    document.getElementById('app').classList.add('hidden');
    document.getElementById('gate').classList.remove('hidden');
    return;
  }
  try{
    const profileSnap = await getDoc(doc(db, 'users', user.uid));
    if(!profileSnap.exists()){
      showBanner("Your account exists but its profile is missing — try logging out and signing up again.");
      return;
    }
    currentProfile = profileSnap.data();
    await enterApp(currentProfile.role);
  }catch(e){
    showBanner("Couldn't load your profile — check your connection and refresh.");
  }
});

async function enterApp(r){
  role = r; // kept for Phase 4 (task-level owner/helper), not used to hide UI anymore
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('switchRoleBtn').textContent = `${currentProfile.name} · log out`;
  document.getElementById('switchRoleBtn').onclick = async ()=>{
    await signOut(auth);
    document.getElementById('loginEmail').value=''; document.getElementById('loginPassword').value='';
  };
  // Every signed-in person gets their own personal grocery list — scoped to their own account.
  initSelectors();
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
    const res = await fetch(await authedUrl('entries'));
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
    const res = await fetch(await authedUrl('entries'), {
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

/* ---------- ADD ITEM (owner) ---------- */
function addItem(){
  const cat = document.getElementById('catSelect').value;
  const name = document.getElementById('itemInput').value.trim();
  const qty = document.getElementById('qtyInput').value;
  const unit = document.getElementById('unitSelect').value;
  if(!name){ showToast("Enter an item name first"); return; }
  entries.push({
    id: 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
    date: todayStr(), category: cat, name: name, qtyNeeded: qty || '', unit: unit,
    status: 'pending', weight: null, rate: null, amount: null, location: null,
    assignedTo: '' // task assignment to connected helpers arrives in Phase 4
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
  let filtered = todays;
  if(activeFilter==='Pending') filtered = todays.filter(e=>e.status==='pending');
  else if(activeFilter==='Purchased') filtered = todays.filter(e=>e.status==='purchased');
  else if(activeFilter!=='All') filtered = todays.filter(e=>e.category===activeFilter);

  const container = document.getElementById('listContainer');
  if(filtered.length===0){
    container.innerHTML = `<div class="empty">${todays.length===0 ? "No items yet — add something above." : "Nothing matches this filter."}</div>`;
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

/* ---------- CONNECTIONS (Phase 2) ---------- */
// Firestore layout:
//   users/{uid}                         -> profile
//   connections/{sortedPairId}          -> { uids: [a,b] sorted, requestedBy, status: 'pending'|'accepted', createdAt }
// Using a deterministic doc id (the two uids sorted and joined) means there can only ever be
// ONE connection doc per pair of people — no duplicate/opposite-direction requests possible.
function pairId(a, b){ return [a, b].sort().join('_'); }

async function getConnectionState(otherUid){
  const me = auth.currentUser.uid;
  const snap = await getDoc(doc(db, 'connections', pairId(me, otherUid)));
  if(!snap.exists()) return { state: 'none' };
  const data = snap.data();
  if(data.status === 'accepted') return { state: 'connected', data };
  return { state: data.requestedBy === me ? 'sent' : 'incoming', data };
}

async function sendConnectionRequest(otherUid){
  const me = auth.currentUser.uid;
  const ref = doc(db, 'connections', pairId(me, otherUid));
  const existing = await getDoc(ref);
  if(existing.exists()){ showToast("Already connected or a request is pending"); return; }
  await setDoc(ref, {
    uids: [me, otherUid].sort(),
    requestedBy: me,
    status: 'pending',
    createdAt: serverTimestamp()
  });
  showToast("Request sent");
}

async function respondToRequest(otherUid, accept){
  const me = auth.currentUser.uid;
  const ref = doc(db, 'connections', pairId(me, otherUid));
  if(accept){
    await updateDoc(ref, { status: 'accepted', updatedAt: serverTimestamp() });
    showToast("Connected");
  }else{
    await deleteDoc(ref);
    showToast("Request declined");
  }
}

async function removeConnection(otherUid){
  if(!confirm("Remove this connection?")) return;
  await deleteDoc(doc(db, 'connections', pairId(auth.currentUser.uid, otherUid)));
  showToast("Connection removed");
  renderPeopleTab();
}

async function searchUsers(term){
  const me = auth.currentUser.uid;
  // Small-scale approach: fetch all profiles and filter client-side. Fine for a friend/family-sized
  // user base; a growing public directory would want a proper search index (e.g. Algolia) instead.
  const snap = await getDocs(collection(db, 'users'));
  const all = snap.docs.map(d => d.data()).filter(u => u.uid !== me);
  const t = term.trim().toLowerCase();
  if(!t) return [];
  return all.filter(u => u.name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t));
}

function connectionButtonHtml(state, uid){
  if(state==='connected') return `<button class="btn-danger remove-conn-btn" data-uid="${uid}">Connected · Remove</button>`;
  if(state==='sent') return `<button class="btn-ghost" disabled>Request sent</button>`;
  if(state==='incoming') return `<button class="btn-primary accept-conn-btn" data-uid="${uid}">Accept</button> <button class="btn-danger reject-conn-btn" data-uid="${uid}">Reject</button>`;
  return `<button class="btn-primary connect-btn" data-uid="${uid}">Connect</button>`;
}

async function renderPeopleTab(){
  await renderSearchResults([]);
  await renderRequests();
  await renderConnectionsList();
}

async function renderSearchResults(results){
  const el = document.getElementById('peopleSearchResults');
  if(results.length===0){ el.innerHTML = `<div class="empty">Search by name or email to find people.</div>`; return; }
  const rows = await Promise.all(results.map(async u=>{
    const { state } = await getConnectionState(u.uid);
    return `<div class="item"><div><div class="item-name">${u.name}</div><div class="item-need">${u.email}</div></div><div class="item-right">${connectionButtonHtml(state, u.uid)}</div></div>`;
  }));
  el.innerHTML = rows.join('');
  attachPeopleHandlers();
}

document.getElementById('peopleSearchBtn').addEventListener('click', async ()=>{
  const term = document.getElementById('peopleSearchInput').value;
  if(!term.trim()){ showToast("Type a name or email first"); return; }
  const results = await searchUsers(term);
  if(results.length===0){
    document.getElementById('peopleSearchResults').innerHTML = `<div class="empty">No one found matching "${term}".</div>`;
  }else{
    await renderSearchResults(results);
  }
});
document.getElementById('peopleSearchInput').addEventListener('keydown', e=>{
  if(e.key==='Enter') document.getElementById('peopleSearchBtn').click();
});

async function renderRequests(){
  const me = auth.currentUser.uid;
  const snap = await getDocs(query(collection(db, 'connections'), where('uids', 'array-contains', me)));
  const incoming = snap.docs
    .map(d => d.data())
    .filter(c => c.status === 'pending' && c.requestedBy !== me);
  const el = document.getElementById('peopleRequests');
  if(incoming.length===0){ el.innerHTML = `<div class="empty">No pending requests.</div>`; return; }
  const rows = await Promise.all(incoming.map(async c=>{
    const otherUid = c.uids.find(u => u !== me);
    const profSnap = await getDoc(doc(db, 'users', otherUid));
    const prof = profSnap.exists() ? profSnap.data() : { name: 'Unknown user', email: '' };
    return `<div class="item"><div><div class="item-name">${prof.name}</div><div class="item-need">${prof.email}</div></div><div class="item-right">${connectionButtonHtml('incoming', otherUid)}</div></div>`;
  }));
  el.innerHTML = rows.join('');
  attachPeopleHandlers();
}

async function renderConnectionsList(){
  const me = auth.currentUser.uid;
  const snap = await getDocs(query(collection(db, 'connections'), where('uids', 'array-contains', me)));
  const accepted = snap.docs.map(d => d.data()).filter(c => c.status === 'accepted');
  const el = document.getElementById('peopleConnections');
  if(accepted.length===0){ el.innerHTML = `<div class="empty">No connections yet — search for someone above.</div>`; return; }
  const rows = await Promise.all(accepted.map(async c=>{
    const otherUid = c.uids.find(u => u !== me);
    const profSnap = await getDoc(doc(db, 'users', otherUid));
    const prof = profSnap.exists() ? profSnap.data() : { name: 'Unknown user', email: '' };
    return `<div class="item"><div><div class="item-name">${prof.name}</div><div class="item-need">${prof.email}</div></div><div class="item-right">${connectionButtonHtml('connected', otherUid)}</div></div>`;
  }));
  el.innerHTML = rows.join('');
  attachPeopleHandlers();
}

function attachPeopleHandlers(){
  document.querySelectorAll('.connect-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      await sendConnectionRequest(btn.dataset.uid);
      renderPeopleTab();
    });
  });
  document.querySelectorAll('.accept-conn-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      await respondToRequest(btn.dataset.uid, true);
      renderPeopleTab();
    });
  });
  document.querySelectorAll('.reject-conn-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      await respondToRequest(btn.dataset.uid, false);
      renderPeopleTab();
    });
  });
  document.querySelectorAll('.remove-conn-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> removeConnection(btn.dataset.uid));
  });
}

/* ---------- PROFILE ---------- */
function renderProfileTab(){
  document.getElementById('profileNameInput').value = currentProfile.name;
  document.getElementById('profileEmailDisplay').value = currentProfile.email;
  document.getElementById('profileMessage').textContent = '';
}

document.getElementById('profileSaveBtn').addEventListener('click', async ()=>{
  const newName = document.getElementById('profileNameInput').value.trim();
  const msgEl = document.getElementById('profileMessage');
  if(!newName){ msgEl.style.color='var(--rust)'; msgEl.textContent = "Name can't be empty"; return; }
  try{
    await updateDoc(doc(db, 'users', auth.currentUser.uid), { name: newName });
    currentProfile.name = newName;
    document.getElementById('switchRoleBtn').textContent = `${currentProfile.name} · log out`;
    msgEl.style.color = 'var(--green)';
    msgEl.textContent = 'Saved';
  }catch(e){
    msgEl.style.color = 'var(--rust)';
    msgEl.textContent = "Couldn't save — check your connection and try again.";
  }
});

document.getElementById('profileResetPasswordBtn').addEventListener('click', async ()=>{
  const msgEl = document.getElementById('profileResetMessage');
  try{
    await sendPasswordResetEmail(auth, currentProfile.email);
    msgEl.style.color = 'var(--green)';
    msgEl.textContent = `Reset link sent to ${currentProfile.email} — check your inbox.`;
  }catch(e){
    msgEl.style.color = 'var(--rust)';
    msgEl.textContent = "Couldn't send the email — check your connection and try again.";
  }
});

/* ---------- TABS ---------- */
document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    const which = tab.dataset.tab;
    document.getElementById('tab-today').style.display = which==='today' ? 'block' : 'none';
    document.getElementById('tab-week').style.display = which==='week' ? 'block' : 'none';
    document.getElementById('tab-month').style.display = which==='month' ? 'block' : 'none';
    document.getElementById('tab-people').style.display = which==='people' ? 'block' : 'none';
    document.getElementById('tab-profile').style.display = which==='profile' ? 'block' : 'none';
    if(which==='week') renderRangeView('tab-week', rangeEntries(7), 'This week');
    if(which==='month') renderRangeView('tab-month', rangeEntries(30), 'This month');
    if(which==='people') renderPeopleTab();
    if(which==='profile') renderProfileTab();
  });
});