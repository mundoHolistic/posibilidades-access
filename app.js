(() => {
  "use strict";

  const DB_NAME = "posibilidades-db";
  const DB_VERSION = 1;
  const STORES = ["people", "sessions", "classes", "followups"];
  const state = { view: "home", followFilter: "today", questionIndex: 0, installPrompt: null, data: { people: [], sessions: [], classes: [], followups: [] } };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const safeText = value => escapeHTML(value).replace(/\n/g, "<br>");
  const fmtDate = value => {
    if (!value) return "Sin fecha";
    const [y,m,d] = value.slice(0,10).split("-").map(Number);
    return new Date(y,m-1,d).toLocaleDateString("es-AR",{day:"2-digit",month:"short",year:"numeric"});
  };
  const fmtMoney = value => {
    const n = Number(value);
    if (!Number.isFinite(n) || value === "" || value == null) return "Sin valor";
    return new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:2}).format(n);
  };
  const personName = id => state.data.people.find(p => p.id === id)?.name || "Persona eliminada";
  const personById = id => state.data.people.find(p => p.id === id);
  const isPast = date => date && date < todayISO();
  const isFutureOrToday = date => date && date >= todayISO();
  const sortByDate = (a,b) => (a.date || "").localeCompare(b.date || "") || (a.time || "").localeCompare(b.time || "");
  let dbPromise;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve,reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store,{keyPath:"id"});
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }
  async function dbAll(store) {
    const db = await openDB();
    return new Promise((resolve,reject) => {
      const tx = db.transaction(store,"readonly"), req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbPut(store, record) {
    const db = await openDB();
    return new Promise((resolve,reject) => {
      const tx = db.transaction(store,"readwrite");
      tx.objectStore(store).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("No se pudo guardar."));
    });
  }
  async function dbRemove(store,id) {
    const db = await openDB();
    return new Promise((resolve,reject) => {
      const tx = db.transaction(store,"readwrite");
      tx.objectStore(store).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function dbClearAll() {
    const db = await openDB();
    return new Promise((resolve,reject) => {
      const tx = db.transaction(STORES,"readwrite");
      STORES.forEach(s => tx.objectStore(s).clear());
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function reloadData() {
    for (const store of STORES) state.data[store] = await dbAll(store);
    state.data.people.sort((a,b)=>(a.name||"").localeCompare(b.name||""));
    state.data.sessions.sort((a,b)=>sortByDate(b,a));
    state.data.classes.sort((a,b)=>sortByDate(a,b));
    state.data.followups.sort((a,b)=>sortByDate(a,b));
  }
  async function saveRecord(store, record) {
    const now = new Date().toISOString();
    const existing = state.data[store].find(x=>x.id===record.id);
    const saved = {...record, updatedAt: now, createdAt: existing?.createdAt || record.createdAt || now};
    await dbPut(store,saved);
    await reloadData();
    renderAll();
    return saved;
  }
  async function removeRecord(store,id) {
    await dbRemove(store,id);
    await reloadData();
    renderAll();
  }
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(()=>el.classList.remove("show"),2800);
  }
  function emptyState(title,desc,actionLabel,action) {
    return `<div class="empty"><div class="empty-symbol">∞</div><strong>${escapeHTML(title)}</strong><p>${escapeHTML(desc)}</p>${actionLabel ? `<button class="btn btn-outline" data-action="${action}">${escapeHTML(actionLabel)}</button>` : ""}</div>`;
  }
  function initials(name) {
    return String(name||"?").trim().split(/\s+/).slice(0,2).map(s=>s[0]||"").join("").toUpperCase();
  }
  function navTo(view) {
    state.view = view;
    $$(".view").forEach(el=>el.classList.toggle("is-active",el.id===`view-${view}`));
    $$(".nav-item").forEach(el=>el.classList.toggle("is-active",el.dataset.view===view));
    $("#mainContent").focus({preventScroll:true});
    window.scrollTo({top:0,behavior:"smooth"});
    renderAll();
  }
  function countSessionsForPerson(id) {
    return state.data.sessions.filter(s=>s.personId===id && (s.date||"")<=todayISO()).length;
  }
  function countClassesForPerson(id) {
    return state.data.classes.filter(c=>(c.attendees||[]).includes(id) && (c.date||"")<=todayISO()).length;
  }
  function upcomingSessions() {
    return state.data.sessions.filter(s=>isFutureOrToday(s.date)).sort(sortByDate).slice(0,5);
  }
  function openFollowups() {
    return state.data.followups.filter(f=>!f.done);
  }
  function renderDashboard() {
    const today = todayISO();
    const sessionsToday = state.data.sessions.filter(s=>s.date===today);
    const followToday = openFollowups().filter(f=>f.date===today);
    const upcomingClass = state.data.classes.filter(c=>isFutureOrToday(c.date)).sort(sortByDate);
    const unpaid = state.data.sessions.filter(s=>s.paymentStatus!=="paid" && (s.value!=="" && s.value!=null));
    const stats = [
      ["Personas",state.data.people.length,"en tu universo"],
      ["Sesiones hoy",sessionsToday.length,"encuentros registrados"],
      ["Seguimientos",openFollowups().length,"por volver a mirar"],
      ["Pagos pendientes",unpaid.length,"intercambios por revisar"]
    ];
    $("#dashboardStats").innerHTML = stats.map(s=>`<article class="stat-card"><span class="stat-label">${s[0]}</span><strong>${s[1]}</strong><small>${s[2]}</small></article>`).join("");
    const todayItems = [
      ...sessionsToday.map(s=>({kind:"Sesión",title:personName(s.personId),desc:`${s.time||"Horario a definir"} · ${s.type||"Sesión"}`,time:s.time||"99:99",action:"view-session",id:s.id})),
      ...followToday.map(f=>({kind:"Seguimiento",title:personName(f.personId),desc:f.title||f.notes||"Volver a mirar",time:f.time||"99:99",action:"view-followup",id:f.id}))
    ].sort((a,b)=>a.time.localeCompare(b.time));
    $("#todayPanel").innerHTML = todayItems.length ? todayItems.map(i=>`<article class="row-card"><div class="avatar">${i.kind==="Sesión"?"◷":"↗"}</div><div class="row-main"><strong>${escapeHTML(i.title)}</strong><p>${escapeHTML(i.desc)}</p></div><div class="row-end"><span class="pill">${i.kind}</span><button class="mini-btn" data-action="${i.action}" data-id="${i.id}">Ver</button></div></article>`).join("") : emptyState("El día está abierto","No tenés sesiones ni seguimientos para hoy registrados.","Agregar seguimiento","new-followup");
    const upcoming = upcomingSessions().map(s=>`<article class="row-card"><div class="avatar">◷</div><div class="row-main"><strong>${escapeHTML(personName(s.personId))}</strong><p>${fmtDate(s.date)} · ${escapeHTML(s.time||"Horario a definir")} · ${escapeHTML(s.type||"Sesión")}</p></div><div class="row-end"><button class="mini-btn" data-action="view-session" data-id="${s.id}">Detalles</button></div></article>`);
    const nextClass = upcomingClass.slice(0,3).map(c=>`<article class="row-card"><div class="avatar">▤</div><div class="row-main"><strong>${escapeHTML(c.name)}</strong><p>${fmtDate(c.date)} · ${Math.max(0,Number(c.capacity||0)-(c.attendees||[]).length)} lugares disponibles</p></div><div class="row-end"><span class="pill">${escapeHTML(c.modality||"Clase")}</span></div></article>`);
    $("#upcomingPanel").innerHTML = [...upcoming,...nextClass].length ? [...upcoming,...nextClass].join("") : emptyState("Todavía no hay actividades próximas","Cuando registres una sesión o clase, aparecerá acá.","Crear una clase","new-class");
    $("#possibilityPanel").innerHTML = getPossibilities().slice(0,4).map(possibilityCard).join("");
  }
  function getPossibilities() {
    const p = state.data.people, sessions = state.data.sessions, classes = state.data.classes, followups = openFollowups();
    const items = [];
    const noNext = p.filter(person => !followups.some(f=>f.personId===person.id && f.date>=todayISO()) && !sessions.some(s=>s.personId===person.id && s.date>=todayISO()));
    if (!p.length) items.push({icon:"∞",metric:"Todo empieza con una posibilidad",text:"Todavía no hay personas cargadas.",question:"¿A quién más podrías invitar a formar parte de tu universo?",action:"new-person",label:"Agregar persona"});
    else if (noNext.length) items.push({icon:"↗",metric:`${noNext.length} ${noNext.length===1?"persona no tiene":"personas no tienen"} un próximo paso`,text:"No hay una sesión próxima ni un seguimiento futuro registrado para ellas.",question:"¿Qué más podrías crear con las personas que ya te eligieron?",action:"view",label:"Mirar personas",view:"people"});
    const available = classes.filter(c=>isFutureOrToday(c.date)).map(c=>({...c,spots:Math.max(0,Number(c.capacity||0)-(c.attendees||[]).length)})).filter(c=>c.spots>0).sort(sortByDate);
    if (available.length) {
      const c=available[0];
      items.push({icon:"▤",metric:`${c.spots} ${c.spots===1?"lugar disponible":"lugares disponibles"}`,text:`Tu clase “${c.name}” tiene espacio para nuevas personas.`,question:"¿A quién podrías invitar?",action:"view-class",id:c.id});
    }
    const stale = p.filter(person=>{
      const last=sessions.filter(s=>s.personId===person.id && s.date).sort((a,b)=>b.date.localeCompare(a.date))[0];
      return last && Math.floor((new Date(todayISO())-new Date(last.date+"T12:00:00"))/86400000)>30;
    });
    if(stale.length) items.push({icon:"◷",metric:`${stale.length} ${stale.length===1?"persona lleva":"personas llevan"} más de 30 días sin sesión`,text:"Quizás haya una posibilidad de retomar el contacto.",question:"¿Qué posibilidad aparece si volvés a abrir el contacto?",action:"view",label:"Ver personas",view:"people"});
    const unpaid=sessions.filter(s=>s.paymentStatus!=="paid" && s.value!=="" && s.value!=null);
    if(unpaid.length) items.push({icon:"◇",metric:`${unpaid.length} ${unpaid.length===1?"intercambio pendiente":"intercambios pendientes"}`,text:"Hay contribuciones que todavía figuran sin completar.",question:"¿Qué elección diferente podrías hacer con respecto a tu intercambio?",action:"view",label:"Revisar sesiones",view:"sessions"});
    const due=followups.filter(f=>f.date<todayISO());
    if(due.length) items.push({icon:"↗",metric:`${due.length} ${due.length===1?"seguimiento vencido":"seguimientos vencidos"}`,text:"Quedaron fechas anteriores a hoy sin marcar como hechas.",question:"¿Qué querés volver a mirar y qué puede esperar?",action:"view",label:"Ver vencidos",view:"followups"});
    const upcomingClasses=classes.filter(c=>isFutureOrToday(c.date)).sort(sortByDate);
    if(upcomingClasses.length) items.push({icon:"✳",metric:"Una clase está en camino",text:`La próxima es “${upcomingClasses[0].name}”, el ${fmtDate(upcomingClasses[0].date)}.`,question:"¿Qué podría hacer que esta clase sea todavía más grande de lo que imaginaste?",action:"view-class",id:upcomingClasses[0].id});
    if(!items.length) items.push({icon:"∞",metric:"Tu práctica está en movimiento",text:"No aparece una alerta prioritaria a partir de los datos cargados.",question:"¿Qué más es posible que todavía no hayas considerado?",action:"question"});
    return items;
  }
  function possibilityCard(item) {
    return `<article class="possibility-card"><div class="poss-icon">${item.icon||"∞"}</div><strong>${escapeHTML(item.metric)}</strong><p>${escapeHTML(item.text)}</p><p class="poss-question">${escapeHTML(item.question)}</p>${item.action==="view" ? `<button class="mini-btn" data-view="${item.view}">${escapeHTML(item.label||"Mirar")} ↗</button>` : item.action==="view-class" ? `<button class="mini-btn" data-action="view-class" data-id="${item.id}">Ver clase ↗</button>` : item.action==="new-person" ? `<button class="mini-btn" data-action="new-person">Agregar persona ↗</button>` : item.action==="question" ? `<button class="mini-btn" data-view="possibilities">Abrir preguntas ↗</button>` : ""}</article>`;
  }
  function renderPeople() {
    const q=($("#peopleSearch")?.value||"").toLowerCase().trim(), filter=$("#peopleFilter")?.value||"all";
    const people=state.data.people.filter(p=>{
      const hay=[p.name,p.city,p.whatsapp,p.instagram,p.email,p.origin,p.activity].join(" ").toLowerCase();
      return (!q||hay.includes(q)) && (filter==="all" || (filter==="active" ? p.status!=="inactive" : p.status==="inactive"));
    });
    $("#peopleList").innerHTML=people.length ? people.map(p=>{
      const next=state.data.followups.filter(f=>f.personId===p.id&&!f.done).sort(sortByDate)[0];
      return `<article class="person-card"><div class="person-card-head"><div class="avatar">${escapeHTML(initials(p.name))}</div><div style="min-width:0;flex:1"><h3>${escapeHTML(p.name)}</h3><p class="muted">${escapeHTML([p.city,p.activity].filter(Boolean).join(" · ")||"Sin datos adicionales")}</p></div><span class="pill ${p.status==="inactive"?"gray":""}">${p.status==="inactive"?"En pausa":"Activa"}</span></div><div class="person-meta"><span class="pill">${countSessionsForPerson(p.id)} sesiones</span><span class="pill">${countClassesForPerson(p.id)} clases</span>${next?`<span class="pill gold">Seguimiento ${fmtDate(next.date)}</span>`:""}</div><div class="person-actions"><button class="mini-btn primary" data-action="view-person" data-id="${p.id}">Ver ficha</button><button class="mini-btn" data-action="new-session" data-person="${p.id}">＋ Sesión</button><button class="mini-btn" data-action="new-followup" data-person="${p.id}">＋ Seguimiento</button>${p.whatsapp?`<button class="mini-btn" data-action="whatsapp" data-id="${p.id}">WhatsApp</button>`:""}${p.instagram?`<button class="mini-btn" data-action="instagram" data-id="${p.id}">Instagram</button>`:""}</div></article>`;
    }).join("") : emptyState(q?"No encontramos coincidencias":"Todavía no hay personas cargadas",q?"Probá con otro nombre o dato.":"Podés empezar agregando a alguien de tu universo.","＋ Nueva persona","new-person");
  }
  function renderSessions() {
    const q=($("#sessionsSearch")?.value||"").toLowerCase().trim(),filter=$("#sessionsFilter")?.value||"all";
    const list=state.data.sessions.filter(s=>{
      const match=[personName(s.personId),s.type,s.notes].join(" ").toLowerCase().includes(q);
      return match && (filter==="all" || (filter==="upcoming"&&isFutureOrToday(s.date)) || (filter==="past"&&isPast(s.date)) || (filter==="unpaid"&&s.paymentStatus!=="paid"));
    }).sort((a,b)=>sortByDate(b,a));
    $("#sessionsList").innerHTML=list.length?list.map(s=>`<article class="row-card"><div class="avatar">◷</div><div class="row-main"><strong>${escapeHTML(personName(s.personId))} · ${escapeHTML(s.type||"Sesión")}</strong><p>${fmtDate(s.date)} · ${escapeHTML(s.time||"Horario a definir")} · ${escapeHTML(s.duration||"Duración no indicada")}</p><p>${escapeHTML(s.paymentStatus==="paid"?"Pago registrado":s.paymentStatus==="partial"?"Pago parcial":"Pago pendiente")} · ${escapeHTML(fmtMoney(s.value))}</p></div><div class="row-end"><span class="pill ${s.paymentStatus==="paid"?"":s.paymentStatus==="partial"?"gold":"rose"}">${s.paymentStatus==="paid"?"Pagada":s.paymentStatus==="partial"?"Parcial":"Pendiente"}</span><button class="mini-btn" data-action="view-session" data-id="${s.id}">Detalles</button></div></article>`).join(""):emptyState("No hay sesiones para mostrar","Registrá una sesión o cambiá el filtro.","＋ Nueva sesión","new-session");
  }
  function renderClasses() {
    const list=state.data.classes;
    $("#classesList").innerHTML=list.length?list.map(c=>{
      const occupied=(c.attendees||[]).length,capacity=Math.max(0,Number(c.capacity||0)),spots=Math.max(0,capacity-occupied),pct=capacity?Math.min(100,occupied/capacity*100):0;
      return `<article class="class-card"><div class="class-top"><div><span class="eyebrow">${escapeHTML(c.modality||"CLASE")}</span><h3>${escapeHTML(c.name)}</h3><p class="muted">${fmtDate(c.date)} · ${escapeHTML(c.time||"Horario a definir")}</p></div><span class="pill ${spots===0?"rose":"gold"}">${spots===0?"Completa":`${spots} disponibles`}</span></div><p class="muted">${escapeHTML([c.place,c.price!==""&&c.price!=null?fmtMoney(c.price):""].filter(Boolean).join(" · "))}</p><div class="capacity-bar"><span style="width:${pct}%"></span></div><div class="capacity-numbers"><span>${occupied} ocupados</span><span>${capacity} cupos</span></div><div class="person-actions"><button class="mini-btn primary" data-action="view-class" data-id="${c.id}">Ver clase</button><button class="mini-btn" data-action="edit-class" data-id="${c.id}">Editar</button><button class="mini-btn" data-action="attendees-class" data-id="${c.id}">Gestionar asistentes</button></div></article>`;
    }).join(""):emptyState("Todavía no hay clases","Creá una clase para organizar fecha, cupo, asistentes y lugares disponibles.","＋ Nueva clase","new-class");
  }
  function followStatus(f) {
    if(f.done) return "done";
    if(f.date<todayISO()) return "overdue";
    if(f.date===todayISO()) return "today";
    return "upcoming";
  }
  function renderFollowups() {
    const all=state.data.followups,open=all.filter(f=>!f.done);
    $("#countToday").textContent=open.filter(f=>f.date===todayISO()).length;
    $("#countUpcoming").textContent=open.filter(f=>f.date>todayISO()).length;
    $("#countOverdue").textContent=open.filter(f=>f.date<todayISO()).length;
    const list=all.filter(f=>followStatus(f)===state.followFilter).sort(sortByDate);
    $("#followupsList").innerHTML=list.length?list.map(f=>{
      const status=followStatus(f);
      return `<article class="row-card"><div class="avatar">${f.done?"✓":"↗"}</div><div class="row-main"><strong>${escapeHTML(personName(f.personId))} · ${escapeHTML(f.title||"Seguimiento")}</strong><p>${fmtDate(f.date)} ${f.time?`· ${escapeHTML(f.time)}`:""}${f.notes?` · ${escapeHTML(f.notes)}`:""}</p><p>${status==="overdue"?"Fecha vencida":status==="today"?"Para hoy":status==="done"?"Marcado como hecho":"Próximo"}</p></div><div class="row-end">${!f.done?`<button class="mini-btn primary" data-action="contact-person" data-id="${f.id}">Contactar</button><button class="mini-btn" data-action="done-followup" data-id="${f.id}">Hecho</button>`:""}<button class="mini-btn" data-action="edit-followup" data-id="${f.id}">Cambiar fecha</button></div></article>`;
    }).join(""):emptyState(state.followFilter==="today"?"Hoy no hay seguimientos":state.followFilter==="upcoming"?"No hay seguimientos próximos":state.followFilter==="overdue"?"No hay seguimientos vencidos":"Todavía no hay seguimientos hechos","Podés registrar un seguimiento cuando quieras volver a mirar una posibilidad.", "＋ Nuevo seguimiento","new-followup");
  }
  const QUESTIONS=[
    "¿Qué más es posible que todavía no hayas considerado?",
    "¿Qué elección abriría más posibilidades para tu práctica hoy?",
    "¿Qué podrías crear si dejaras de hacer esto como siempre?",
    "¿Qué contribución podrías ser para las personas que te eligen?",
    "¿Qué posibilidad está disponible ahora que antes no veías?",
    "¿Qué más podrías elegir sin tener que justificarlo?",
    "¿Qué podría ser más fácil de lo que imaginás?",
    "¿Qué pregunta todavía no te hiciste?"
  ];
  function contextQuestion() {
    const p=state.data.people, follow=openFollowups(), upcoming=state.data.classes.filter(c=>isFutureOrToday(c.date)), unpaid=state.data.sessions.filter(s=>s.paymentStatus!=="paid"&&s.value!==""&&s.value!=null);
    if(!p.length)return "¿A quién más podrías invitar a formar parte de tu universo?";
    if(follow.length>p.length)return "¿Qué más podrías crear con las personas que ya te eligieron?";
    if(upcoming.some(c=>Number(c.capacity||0)>(c.attendees||[]).length))return "¿Qué podría hacer que tu próxima clase sea todavía más grande de lo que imaginaste?";
    if(unpaid.length)return "¿Qué elección diferente podrías hacer con respecto a tu intercambio?";
    return QUESTIONS[state.questionIndex%QUESTIONS.length];
  }
  function renderPossibilities() {
    $("#possibilitiesFull").innerHTML=getPossibilities().map(possibilityCard).join("");
    $("#questionOfTheMoment").textContent=contextQuestion();
  }
  function renderAll() {
    renderDashboard();
    renderPeople();
    renderSessions();
    renderClasses();
    renderFollowups();
    renderPossibilities();
  }

  function field(label,name,value="",type="text",opts={}) {
    const full=opts.full?" full":"", required=opts.required?' required':'', placeholder=opts.placeholder?` placeholder="${escapeHTML(opts.placeholder)}"`:"";
    let control="";
    if(type==="textarea") control=`<textarea name="${name}"${required}${placeholder}>${escapeHTML(value??"")}</textarea>`;
    else if(type==="select") control=`<select name="${name}"${required}>${(opts.options||[]).map(o=>`<option value="${escapeHTML(o.value)}" ${String(o.value)===String(value)?"selected":""}>${escapeHTML(o.label)}</option>`).join("")}</select>`;
    else control=`<input name="${name}" type="${type}" value="${escapeHTML(value??"")}"${required}${placeholder}${opts.min!==undefined?` min="${opts.min}"`:""}${opts.step?` step="${opts.step}"`:""}>`;
    return `<div class="field${full}"><label>${escapeHTML(label)}${opts.required?" *":""}</label>${control}${opts.hint?`<small class="hint">${escapeHTML(opts.hint)}</small>`:""}</div>`;
  }
  function personOptions(selected="") {
    return [{value:"",label:"Seleccionar persona"},...state.data.people.map(p=>({value:p.id,label:p.name}))];
  }
  function openModal(title,subtitle,body,actions="") {
    $("#modalRoot").innerHTML=`<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}"><header class="modal-head"><div><span class="eyebrow">POSIBILIDADES</span><h2>${escapeHTML(title)}</h2><p>${escapeHTML(subtitle||"")}</p></div><button class="modal-close" data-action="close-modal" aria-label="Cerrar">×</button></header><div class="modal-body">${body}${actions}</div></section></div>`;
    $("#modalRoot .modal-backdrop").addEventListener("click",e=>{if(e.target.matches("[data-modal-backdrop]"))closeModal();});
    const first=$("#modalRoot input, #modalRoot select, #modalRoot textarea, #modalRoot button");
    if(first) setTimeout(()=>first.focus(),40);
  }
  function closeModal(){ $("#modalRoot").innerHTML=""; }
  function formActions(id,store,deleteAction="") {
    return `<div class="modal-actions">${id?`<button class="btn btn-danger" type="button" data-action="delete-record" data-store="${store}" data-id="${id}">Eliminar</button>`:"<span></span>"}<div class="modal-actions-right"><button class="btn btn-outline" type="button" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit">Guardar</button></div></div>`;
  }
  function openPersonForm(id=null) {
    const p=id?personById(id):{};
    openModal(id?"Editar persona":"Nueva persona","Completá lo que tengas a mano. Podés volver a editarlo después.",`<form id="personForm" data-id="${id||""}"><div class="form-grid">${field("Nombre y apellido / apodo","name",p.name||"","text",{required:true,full:true,placeholder:"Nombre de la persona"})}${field("WhatsApp","whatsapp",p.whatsapp||"","tel",{placeholder:"Código de país + número"})}${field("Instagram","instagram",p.instagram||"","text",{placeholder:"Usuario o enlace"})}${field("Email","email",p.email||"","email")}${field("Ciudad","city",p.city||"")}${field("Cómo llegó","origin",p.origin||"","text",{placeholder:"Recomendación, redes, clase..."})}${field("Qué hace con vos","activity",p.activity||"","text",{full:true,placeholder:"Barras, sesión, clase..."})}${field("Estado","status",p.status||"active","select",{options:[{value:"active",label:"Activa"},{value:"inactive",label:"En pausa"}]})}${field("Notas","notes",p.notes||"","textarea",{full:true,placeholder:"Información útil para tu práctica"})}</div>${formActions(id,"people")}</form>`);
  }
  function openSessionForm(id=null,personId="") {
    if(!state.data.people.length){toast("Primero agregá una persona.");openPersonForm();return;}
    const s=id?state.data.sessions.find(x=>x.id===id):{};
    const body=`<form id="sessionForm" data-id="${id||""}"><div class="form-grid">${field("Persona","personId",s.personId||personId,"select",{options:personOptions(s.personId||personId),required:true,full:true})}${field("Fecha","date",s.date||todayISO(),"date",{required:true})}${field("Hora","time",s.time||"")}${field("Tipo de sesión","type",s.type||"Barras de Access","text",{required:true})}${field("Duración","duration",s.duration||"60 minutos","text")}${field("Valor / contribución (ARS)","value",s.value??"","number",{min:0,step:"0.01",hint:"Podés dejarlo vacío si no corresponde."})}${field("Estado del pago","paymentStatus",s.paymentStatus||"pending","select",{options:[{value:"pending",label:"Pendiente"},{value:"partial",label:"Parcial"},{value:"paid",label:"Pagado"}]})}${field("Próximo seguimiento","nextFollowupDate",s.nextFollowupDate||"","date")}${field("Notas","notes",s.notes||"","textarea",{full:true})}</div>${formActions(id,"sessions")}</form>`;
    openModal(id?"Editar sesión":"Registrar sesión","Un registro claro para cada encuentro.",body);
  }
  function openClassForm(id=null) {
    const c=id?state.data.classes.find(x=>x.id===id):{};
    const body=`<form id="classForm" data-id="${id||""}"><div class="form-grid">${field("Nombre de la clase","name",c.name||"","text",{required:true,full:true})}${field("Fecha","date",c.date||todayISO(),"date",{required:true})}${field("Hora","time",c.time||"")}${field("Modalidad","modality",c.modality||"Presencial","select",{options:[{value:"Presencial",label:"Presencial"},{value:"Online",label:"Online"},{value:"Híbrida",label:"Híbrida"},{value:"Otra",label:"Otra"}]})}${field("Lugar / enlace","place",c.place||"","text",{full:true})}${field("Cupo total","capacity",c.capacity??8,"number",{required:true,min:0,step:"1"})}${field("Precio / contribución (ARS)","price",c.price??"","number",{min:0,step:"0.01"})}${field("Notas","notes",c.notes||"","textarea",{full:true})}</div>${formActions(id,"classes")}</form>`;
    openModal(id?"Editar clase":"Nueva clase","El cupo disponible se calcula según las personas anotadas.",body);
  }
  function openFollowupForm(id=null,personId="") {
    if(!state.data.people.length){toast("Primero agregá una persona.");openPersonForm();return;}
    const f=id?state.data.followups.find(x=>x.id===id):{};
    const body=`<form id="followupForm" data-id="${id||""}"><div class="form-grid">${field("Persona","personId",f.personId||personId,"select",{options:personOptions(f.personId||personId),required:true,full:true})}${field("Fecha","date",f.date||todayISO(),"date",{required:true})}${field("Hora","time",f.time||"")}${field("Motivo / título","title",f.title||"Volver a mirar","text",{required:true,full:true})}${field("Notas","notes",f.notes||"","textarea",{full:true})}</div>${formActions(id,"followups")}</form>`;
    openModal(id?"Editar seguimiento":"Nuevo seguimiento","Una fecha para volver a mirar una posibilidad.",body);
  }
  function detailItem(label,value) { return `<div class="detail-item"><small>${escapeHTML(label)}</small><strong>${value?escapeHTML(value):"—"}</strong></div>`; }
  function openPersonDetail(id) {
    const p=personById(id);if(!p)return;
    const sessions=state.data.sessions.filter(s=>s.personId===id).sort((a,b)=>sortByDate(b,a));
    const follows=state.data.followups.filter(f=>f.personId===id&&!f.done).sort(sortByDate);
    const classList=state.data.classes.filter(c=>(c.attendees||[]).includes(id));
    const body=`<div class="detail-list">${detailItem("Nombre",p.name)}${detailItem("Estado",p.status==="inactive"?"En pausa":"Activa")}${detailItem("WhatsApp",p.whatsapp)}${detailItem("Instagram",p.instagram)}${detailItem("Email",p.email)}${detailItem("Ciudad",p.city)}${detailItem("Cómo llegó",p.origin)}${detailItem("Qué hace con vos",p.activity)}${detailItem("Sesiones registradas",String(sessions.length))}${detailItem("Clases anotadas",String(classList.length))}</div><div class="detail-section"><h3>Notas</h3><p>${safeText(p.notes||"Sin notas registradas.")}</p></div><div class="detail-section"><h3>Historial de sesiones</h3>${sessions.length?sessions.slice(0,8).map(s=>`<article class="row-card"><div class="row-main"><strong>${escapeHTML(s.type||"Sesión")}</strong><p>${fmtDate(s.date)} · ${escapeHTML(s.time||"")}</p></div><button class="mini-btn" data-action="view-session" data-id="${s.id}">Ver</button></article>`).join(""):"<p class='muted'>Todavía no hay sesiones registradas.</p>"}</div><div class="detail-section"><h3>Próximos seguimientos</h3>${follows.length?follows.map(f=>`<article class="row-card"><div class="row-main"><strong>${escapeHTML(f.title||"Seguimiento")}</strong><p>${fmtDate(f.date)}</p></div><button class="mini-btn" data-action="edit-followup" data-id="${f.id}">Editar</button></article>`).join(""):"<p class='muted'>No hay seguimientos abiertos.</p>"}</div><div class="inline-actions">${p.whatsapp?`<button class="mini-btn" data-action="whatsapp" data-id="${p.id}">WhatsApp</button>`:""}${p.instagram?`<button class="mini-btn" data-action="instagram" data-id="${p.id}">Instagram</button>`:""}<button class="mini-btn primary" data-action="new-session" data-person="${p.id}">＋ Nueva sesión</button><button class="mini-btn" data-action="new-followup" data-person="${p.id}">＋ Seguimiento</button></div><div class="modal-actions"><button class="btn btn-danger" data-action="delete-record" data-store="people" data-id="${p.id}">Eliminar persona</button><div class="modal-actions-right"><button class="btn btn-outline" data-action="close-modal">Cerrar</button><button class="btn btn-primary" data-action="edit-person" data-id="${p.id}">Editar ficha</button></div></div>`;
    openModal(p.name,"Ficha e historial de esta persona.",body);
  }
  function openSessionDetail(id) {
    const s=state.data.sessions.find(x=>x.id===id);if(!s)return;
    const body=`<div class="detail-list">${detailItem("Persona",personName(s.personId))}${detailItem("Fecha",fmtDate(s.date))}${detailItem("Hora",s.time)}${detailItem("Tipo",s.type)}${detailItem("Duración",s.duration)}${detailItem("Valor",s.value!==""&&s.value!=null?fmtMoney(s.value):"")}${detailItem("Pago",s.paymentStatus==="paid"?"Pagado":s.paymentStatus==="partial"?"Parcial":"Pendiente")}${detailItem("Próximo seguimiento",s.nextFollowupDate?fmtDate(s.nextFollowupDate):"")}</div><div class="detail-section"><h3>Notas</h3><p>${safeText(s.notes||"Sin notas registradas.")}</p></div><div class="modal-actions"><button class="btn btn-danger" data-action="delete-record" data-store="sessions" data-id="${s.id}">Eliminar</button><div class="modal-actions-right"><button class="btn btn-outline" data-action="close-modal">Cerrar</button><button class="btn btn-primary" data-action="edit-session" data-id="${s.id}">Editar sesión</button></div></div>`;
    openModal(`${s.type||"Sesión"}`,personName(s.personId),body);
  }
  function openClassDetail(id) {
    const c=state.data.classes.find(x=>x.id===id);if(!c)return;
    const attendees=c.attendees||[],cap=Number(c.capacity||0),spots=Math.max(0,cap-attendees.length);
    const body=`<div class="detail-list">${detailItem("Clase",c.name)}${detailItem("Fecha",fmtDate(c.date))}${detailItem("Hora",c.time)}${detailItem("Modalidad",c.modality)}${detailItem("Lugar / enlace",c.place)}${detailItem("Cupo total",String(cap))}${detailItem("Ocupados",String(attendees.length))}${detailItem("Disponibles",String(spots))}${detailItem("Precio",c.price!==""&&c.price!=null?fmtMoney(c.price):"")}</div><div class="detail-section"><h3>Asistentes</h3>${attendees.length?attendees.map(pid=>`<article class="row-card"><div class="avatar">${escapeHTML(initials(personName(pid)))}</div><div class="row-main"><strong>${escapeHTML(personName(pid))}</strong></div><button class="mini-btn" data-action="remove-attendee" data-class="${c.id}" data-person="${pid}">Quitar</button></article>`).join(""):"<p class='muted'>Todavía no hay asistentes anotados.</p>"}</div><div class="inline-actions"><button class="mini-btn primary" data-action="attendees-class" data-id="${c.id}">Gestionar asistentes</button></div><div class="detail-section"><p class="muted">¿A quién podrías invitar para ocupar los lugares que quedan?</p></div><div class="modal-actions"><button class="btn btn-danger" data-action="delete-record" data-store="classes" data-id="${c.id}">Eliminar clase</button><div class="modal-actions-right"><button class="btn btn-outline" data-action="close-modal">Cerrar</button><button class="btn btn-primary" data-action="edit-class" data-id="${c.id}">Editar clase</button></div></div>`;
    openModal(c.name,"Cupo y lista de asistentes.",body);
  }
  function openAttendeesModal(id) {
    const c=state.data.classes.find(x=>x.id===id);if(!c)return;
    if(!state.data.people.length){toast("Primero agregá personas para poder anotarlas.");openPersonForm();return;}
    const attendees=c.attendees||[];
    const body=`<form id="attendeesForm" data-id="${id}"><p class="muted">Marcá las personas que asistirán. Cupo: ${Number(c.capacity||0)} · Ya anotadas: ${attendees.length}.</p><div class="attendee-options">${state.data.people.map(p=>`<label class="attendee-option"><input type="checkbox" name="attendee" value="${p.id}" ${attendees.includes(p.id)?"checked":""}><span><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.city||p.activity||"")}</small></span></label>`).join("")}</div><div class="modal-actions"><button class="btn btn-outline" type="button" data-action="close-modal">Cancelar</button><div class="modal-actions-right"><button class="btn btn-primary" type="submit">Guardar asistentes</button></div></div></form>`;
    openModal("Gestionar asistentes",c.name,body);
  }
  function openFollowupDetail(id) {
    const f=state.data.followups.find(x=>x.id===id);if(!f)return;
    openModal(f.title||"Seguimiento",personName(f.personId),`<div class="detail-list">${detailItem("Persona",personName(f.personId))}${detailItem("Fecha",fmtDate(f.date))}${detailItem("Hora",f.time)}${detailItem("Estado",f.done?"Hecho":followStatus(f)==="overdue"?"Vencido":followStatus(f)==="today"?"Hoy":"Próximo")}</div><div class="detail-section"><p>${safeText(f.notes||"Sin notas.")}</p></div><div class="modal-actions"><button class="btn btn-danger" data-action="delete-record" data-store="followups" data-id="${f.id}">Eliminar</button><div class="modal-actions-right"><button class="btn btn-outline" data-action="close-modal">Cerrar</button><button class="btn btn-primary" data-action="edit-followup" data-id="${f.id}">Cambiar fecha</button></div></div>`);
  }

  async function handleFormSubmit(form) {
    const fd=new FormData(form),data=Object.fromEntries(fd.entries()),id=form.dataset.id||uid();
    try {
      if(form.id==="personForm"){
        if(!data.name.trim()){toast("El nombre es obligatorio.");return;}
        await saveRecord("people",{...data,id,name:data.name.trim()});
        closeModal();toast("Persona guardada.");
      } else if(form.id==="sessionForm"){
        if(!data.personId||!data.date||!data.type.trim()){toast("Completá persona, fecha y tipo de sesión.");return;}
        const nextFollowupDate=data.nextFollowupDate;
        await saveRecord("sessions",{...data,id,value:data.value===""?"":Number(data.value),duration:data.duration||"",paymentStatus:data.paymentStatus||"pending",notes:data.notes||""});
        if(nextFollowupDate){
          await saveRecord("followups",{id:uid(),personId:data.personId,date:nextFollowupDate,time:"",title:"Volver a mirar después de la sesión",notes:"Seguimiento sugerido al registrar la sesión.",done:false,sourceSessionId:id});
        }
        closeModal();toast("Sesión guardada. ¿Cuándo sería una contribución volver a mirar esta posibilidad?");
      } else if(form.id==="classForm"){
        if(!data.name.trim()||!data.date){toast("Completá el nombre y la fecha de la clase.");return;}
        const existing=state.data.classes.find(c=>c.id===id);
        const attendees=existing?.attendees||[];
        if(Number(data.capacity)<attendees.length){toast("El cupo no puede ser menor que los asistentes anotados.");return;}
        await saveRecord("classes",{...data,id,capacity:Number(data.capacity||0),price:data.price===""?"":Number(data.price),attendees,notes:data.notes||""});
        closeModal();toast("Clase guardada.");
      } else if(form.id==="followupForm"){
        if(!data.personId||!data.date||!data.title.trim()){toast("Completá persona, fecha y motivo.");return;}
        const existing=state.data.followups.find(f=>f.id===id);
        await saveRecord("followups",{...data,id,done:existing?.done||false,notes:data.notes||""});
        closeModal();toast("Seguimiento guardado.");
      } else if(form.id==="attendeesForm"){
        const c=state.data.classes.find(x=>x.id===form.dataset.id);if(!c)return;
        const attendees=$$('input[name="attendee"]:checked',form).map(x=>x.value);
        if(attendees.length>Number(c.capacity||0)){toast(`El cupo es de ${c.capacity}. Hay ${attendees.length} personas seleccionadas.`);return;}
        await saveRecord("classes",{...c,attendees});
        closeModal();toast("Asistentes actualizados.");
      }
    } catch(error){console.error(error);toast("No se pudo guardar. Probá nuevamente y exportá una copia si el problema continúa.");}
  }
  async function deleteWithConfirm(store,id) {
    const labels={people:"persona",sessions:"sesión",classes:"clase",followups:"seguimiento"};
    if(!confirm(`¿Querés eliminar este registro (${labels[store]||store})? Esta acción no se puede deshacer.`))return;
    try {
      if(store==="people"){
        // Evita dejar referencias huérfanas: pregunta antes y elimina los registros relacionados de esa persona.
        const relatedSessions=state.data.sessions.filter(s=>s.personId===id),relatedFollows=state.data.followups.filter(f=>f.personId===id);
        if((relatedSessions.length||relatedFollows.length)&&!confirm("Esta persona tiene historial. Si la eliminás, también se eliminarán sus sesiones y seguimientos. ¿Continuar?"))return;
        for(const s of relatedSessions)await dbRemove("sessions",s.id);
        for(const f of relatedFollows)await dbRemove("followups",f.id);
        for(const c of state.data.classes.filter(c=>(c.attendees||[]).includes(id)))await dbPut("classes",{...c,attendees:c.attendees.filter(pid=>pid!==id)});
      }
      await removeRecord(store,id);closeModal();toast("Registro eliminado.");
    } catch(e){console.error(e);toast("No se pudo eliminar el registro.");}
  }
  function exportData() {
    const payload={app:"Posibilidades",formatVersion:1,exportedAt:new Date().toISOString(),data:state.data};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=`posibilidades-copia-${todayISO()}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    toast("Copia de seguridad exportada.");
  }
  async function importData(file) {
    try {
      const raw=JSON.parse(await file.text());
      if(!raw||raw.app!=="Posibilidades"||raw.formatVersion!==1||!raw.data)throw new Error("Formato no reconocido.");
      const counts={};
      for(const store of STORES){
        const records=raw.data[store];
        if(!Array.isArray(records))continue;
        counts[store]=0;
        for(const item of records){
          if(!item||typeof item!=="object"||!item.id)continue;
          // Upsert por ID: se combinan datos y no se vacía ninguna colección.
          await dbPut(store,item);counts[store]++;
        }
      }
      await reloadData();renderAll();
      toast(`Copia importada: ${Object.values(counts).reduce((a,b)=>a+b,0)} registros agregados o actualizados.`);
    }catch(e){console.error(e);alert("No se pudo importar el archivo. Elegí una copia JSON exportada desde Posibilidades.");}
  }
  async function installApp() {
    if(state.installPrompt){
      state.installPrompt.prompt();
      const result=await state.installPrompt.userChoice;
      if(result?.outcome==="accepted")toast("La instalación fue aceptada.");
      state.installPrompt=null;$("#installBtn").hidden=true;
    } else {
      openModal("Instalar Posibilidades","La forma de instalación depende del dispositivo.",`<div class="detail-section"><h3>Android o computadora</h3><p>Usá el botón “Instalar app” si aparece. Si no, abrí el menú del navegador y buscá “Instalar aplicación” o “Agregar a pantalla de inicio”.</p><h3>iPhone o iPad</h3><p>1. Abrí este enlace en Safari.<br>2. Tocá Compartir (el cuadrado con flecha).<br>3. Elegí “Agregar a pantalla de inicio”.<br>4. Confirmá con “Agregar”.</p><p class="muted">La instalación requiere que el sitio esté publicado con HTTPS.</p></div><div class="modal-actions"><button class="btn btn-primary" data-action="close-modal">Entendido</button></div>`);
    }
  }
  function externalLink(url) { window.open(url,"_blank","noopener,noreferrer"); }
  function handleAction(el) {
    const action=el.dataset.action,id=el.dataset.id,person=el.dataset.person,store=el.dataset.store;
    switch(action){
      case "close-modal":closeModal();break;
      case "new-person":openPersonForm();break;
      case "edit-person":closeModal();openPersonForm(id);break;
      case "view-person":openPersonDetail(id);break;
      case "new-session":closeModal();openSessionForm(null,person||"");break;
      case "edit-session":closeModal();openSessionForm(id);break;
      case "view-session":openSessionDetail(id);break;
      case "new-class":openClassForm();break;
      case "edit-class":closeModal();openClassForm(id);break;
      case "view-class":openClassDetail(id);break;
      case "attendees-class":closeModal();openAttendeesModal(id);break;
      case "remove-attendee":{
        const c=state.data.classes.find(x=>x.id===el.dataset.class);if(c){saveRecord("classes",{...c,attendees:(c.attendees||[]).filter(pid=>pid!==person)}).then(()=>{closeModal();openClassDetail(c.id);toast("Asistente quitado.");});}
        break;
      }
      case "new-followup":closeModal();openFollowupForm(null,person||"");break;
      case "edit-followup":closeModal();openFollowupForm(id);break;
      case "view-followup":openFollowupDetail(id);break;
      case "done-followup":{
        const f=state.data.followups.find(x=>x.id===id);if(f)saveRecord("followups",{...f,done:true}).then(()=>toast("Seguimiento marcado como hecho."));break;
      }
      case "delete-record":deleteWithConfirm(store,id);break;
      case "whatsapp":{
        const p=personById(id);if(p?.whatsapp){const number=p.whatsapp.replace(/[^\d]/g,"");if(number)externalLink(`https://wa.me/${number}`);else toast("Agregá el código de país y número en la ficha.");}break;
      }
      case "instagram":{
        const p=personById(id);if(p?.instagram){let handle=p.instagram.trim();if(!/^https?:\/\//i.test(handle))handle="https://www.instagram.com/"+handle.replace(/^@/,"");externalLink(handle);}break;
      }
      case "contact-person":{
        const f=state.data.followups.find(x=>x.id===id),p=f&&personById(f.personId);
        if(p?.whatsapp){const number=p.whatsapp.replace(/[^\d]/g,"");externalLink(`https://wa.me/${number}`);}else if(p?.instagram){let h=p.instagram.trim();if(!/^https?:\/\//i.test(h))h="https://www.instagram.com/"+h.replace(/^@/,"");externalLink(h);}else{toast("Esta persona no tiene WhatsApp ni Instagram registrado.");}break;
      }
      case "question":state.questionIndex++;renderPossibilities();break;
    }
  }

  document.addEventListener("click",e=>{
    const viewEl=e.target.closest("[data-view]");
    const actionEl=e.target.closest("[data-action]");
    if(actionEl){e.preventDefault();handleAction(actionEl);return;}
    if(viewEl){e.preventDefault();navTo(viewEl.dataset.view);return;}
  });
  document.addEventListener("submit",e=>{
    const form=e.target.closest("form");
    if(form&&["personForm","sessionForm","classForm","followupForm","attendeesForm"].includes(form.id)){e.preventDefault();handleFormSubmit(form);}
  });
  document.addEventListener("click",e=>{
    const tab=e.target.closest("[data-follow-filter]");
    if(tab){state.followFilter=tab.dataset.followFilter;$$("[data-follow-filter]").forEach(t=>t.classList.toggle("is-active",t===tab));renderFollowups();}
  });
  $("#peopleSearch").addEventListener("input",renderPeople);
  $("#peopleFilter").addEventListener("change",renderPeople);
  $("#sessionsSearch").addEventListener("input",renderSessions);
  $("#sessionsFilter").addEventListener("change",renderSessions);
  $("#backupBtn").addEventListener("click",exportData);
  $("#exportBtn").addEventListener("click",exportData);
  $("#importFile").addEventListener("change",async e=>{const file=e.target.files?.[0];if(file){await importData(file);e.target.value="";}});
  $("#clearDataBtn").addEventListener("click",async()=>{
    if(!confirm("¿Eliminar todas las personas, sesiones, clases y seguimientos guardados en este dispositivo?"))return;
    if(!confirm("Última confirmación: esta acción es irreversible. ¿Exportaste una copia si querés conservar los datos?"))return;
    try{await dbClearAll();await reloadData();renderAll();toast("Se eliminaron los datos de este dispositivo.");}catch(e){toast("No se pudieron eliminar los datos.");}
  });
  $("#installHelpBtn").addEventListener("click",installApp);
  $("#installBtn").addEventListener("click",installApp);
  $("#newQuestionBtn").addEventListener("click",()=>{state.questionIndex++;$("#questionOfTheMoment").textContent=contextQuestion();});
  $("#noticeClose").addEventListener("click",()=>$("#localNotice").hidden=true);
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.installPrompt=e;$("#installBtn").hidden=false;});
  window.addEventListener("appinstalled",()=>{state.installPrompt=null;$("#installBtn").hidden=true;toast("Posibilidades quedó instalada en tu dispositivo.");});
  if("serviceWorker" in navigator && /^https?:$/.test(location.protocol)){
    window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(err=>console.warn("No se pudo registrar el service worker",err)));
  }
  (async()=>{
    try{
      await openDB();await reloadData();renderAll();
      $("#questionOfTheMoment").textContent=contextQuestion();
    }catch(error){
      console.error(error);
      $("#mainContent").innerHTML=`<div class="empty"><strong>No pudimos abrir el almacenamiento local</strong><p>Usá una versión actualizada de Chrome, Safari, Edge o Firefox y abrí la app desde HTTPS o localhost. No borres los datos del navegador.</p></div>`;
    }
  })();
})();