(function(){
  "use strict";
  var STORAGE_KEY = "stablePubData_v1";
  var LANG_KEY = "stablePubLang";
  var SESSION_KEY = "stablePubSession";

  // ---------- Translation helpers ----------
  function getLang(){
    return localStorage.getItem(LANG_KEY) || "he";
  }
  function setLang(lang){
    localStorage.setItem(LANG_KEY, lang);
    applyLanguage();
  }
  function t(key, params){
    var dict = window.STABLE_PUB_I18N[getLang()] || window.STABLE_PUB_I18N.en;
    var str = dict[key];
    if(str === undefined) str = window.STABLE_PUB_I18N.en[key];
    if(str === undefined) return key;
    if(params){
      Object.keys(params).forEach(function(k){
        str = str.split("{" + k + "}").join(params[k]);
      });
    }
    return str;
  }

  function applyLanguage(){
    var lang = getLang();
    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === "he") ? "rtl" : "ltr";

    document.querySelectorAll("[data-i18n]").forEach(function(el){
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function(el){
      el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
    });

    var langBtn = document.getElementById("btnLangToggle");
    if(langBtn) langBtn.textContent = t("lang_toggle");

    // Re-render anything built dynamically in JS so it picks up the new language too.
    renderMembers();
    renderMenu();
    renderLog();
    renderBackupStatus();
    renderPrinterSettings();
    renderStaff();
    renderCalendar();
    updateUserBadge();
    if(document.getElementById("reportMonth").value){
      var reopen = openDetail;
      renderReport();
      if(reopen) showMemberDetail(reopen.monthStr, reopen.memberId);
    }
  }

  // ---------- Staff accounts / login ----------
  function getCurrentUser(){
    var username = sessionStorage.getItem(SESSION_KEY);
    if(!username) return null;
    return data.users.find(function(u){ return u.username === username && u.active; }) || null;
  }
  function needsLogin(){
    return data.users.length > 0 && !getCurrentUser();
  }
  function showLoginGateIfNeeded(){
    var overlay = document.getElementById("loginOverlay");
    if(needsLogin()){
      overlay.style.display = "flex";
      document.getElementById("loginError").style.display = "none";
      document.getElementById("loginPassword").value = "";
      document.getElementById("loginUsername").focus();
    } else {
      overlay.style.display = "none";
    }
    updateUserBadge();
  }
  function updateUserBadge(){
    var badge = document.getElementById("userBadge");
    var current = getCurrentUser();
    if(current){
      badge.style.display = "flex";
      document.getElementById("userBadgeText").textContent = t("logged_in_as", {name: current.username});
    } else {
      badge.style.display = "none";
    }
    updateStaffNavVisibility();
  }

  function isCurrentUserAdmin(){
    var current = getCurrentUser();
    return !!(current && current.role === "admin");
  }
  // While there are no accounts yet, staff management stays open so the
  // very first account can be created - it always becomes an Admin.
  function canManageStaff(){
    return data.users.length === 0 || isCurrentUserAdmin();
  }
  function requireAdmin(){
    if(canManageStaff()) return true;
    alert(t("alert_admin_only"));
    return false;
  }
  function isLastActiveAdmin(u){
    if(u.role !== "admin" || !u.active) return false;
    return !data.users.some(function(x){ return x.id!==u.id && x.role==="admin" && x.active; });
  }
  // Log Drinks is the only tab a non-admin gets. Everything else - members,
  // menu and prices, the calendar, the monthly report, backup, staff - is
  // admin-only. Written as "everything except the log" rather than a list of
  // admin tabs on purpose: any tab added later is hidden from staff by
  // default, which is the safe way round to be wrong.
  var STAFF_VIEW = "log";

  function isViewAllowed(view){
    return view === STAFF_VIEW || canManageStaff();
  }

  function goToLogView(){
    document.querySelectorAll("section.view").forEach(function(s){ s.classList.remove("active"); });
    document.querySelectorAll("nav button").forEach(function(b){ b.classList.remove("active"); });
    document.getElementById("view-" + STAFF_VIEW).classList.add("active");
    var logNavBtn = document.querySelector('nav button[data-view="' + STAFF_VIEW + '"]');
    if(logNavBtn) logNavBtn.classList.add("active");
  }

  function updateStaffNavVisibility(){
    var kickedOut = false;
    document.querySelectorAll("nav button").forEach(function(navBtn){
      var view = navBtn.dataset.view;
      var allowed = isViewAllowed(view);
      navBtn.style.display = allowed ? "" : "none";
      if(!allowed){
        var section = document.getElementById("view-" + view);
        // If a now-forbidden tab is the one on screen (they just logged out,
        // or signed in as staff), don't leave them staring at it.
        if(section && section.classList.contains("active")) kickedOut = true;
      }
    });
    if(kickedOut) goToLogView();

    // Re-evaluate the "back up now" nudge on the Log tab: it's admin
    // housekeeping and its button downloads the whole data file, so staff
    // shouldn't be handed it. renderBackupStatus owns that decision - calling
    // it here is what makes the nudge appear when an admin signs in, since
    // otherwise it's only worked out at page load, before anyone has.
    renderBackupStatus();
  }

  document.getElementById("btnLogin").addEventListener("click", function(){
    var username = document.getElementById("loginUsername").value.trim();
    var password = document.getElementById("loginPassword").value;
    var match = data.users.find(function(u){
      return u.active && u.username.toLowerCase() === username.toLowerCase() && u.password === password;
    });
    if(match){
      sessionStorage.setItem(SESSION_KEY, match.username);
      showLoginGateIfNeeded();
      renderLog();
    } else {
      document.getElementById("loginError").style.display = "block";
    }
  });
  ["loginUsername","loginPassword"].forEach(function(id){
    document.getElementById(id).addEventListener("keydown", function(e){
      if(e.key === "Enter") document.getElementById("btnLogin").click();
    });
  });

  document.getElementById("btnLogout").addEventListener("click", function(){
    sessionStorage.removeItem(SESSION_KEY);
    showLoginGateIfNeeded();
  });

  function renderStaff(){
    // First account ever: no role picker needed (it's forced to Admin),
    // and staff management stays open with no gate.
    var isBootstrap = data.users.length === 0;
    document.getElementById("firstAccountNote").style.display = isBootstrap ? "block" : "none";
    document.getElementById("newStaffRoleField").style.display = isBootstrap ? "none" : "";
    updateStaffNavVisibility();

    var tbody = document.querySelector("#staffTable tbody");
    tbody.innerHTML = "";
    data.users.slice().sort(function(a,b){return a.username.localeCompare(b.username);}).forEach(function(u){
      var hasEntries = data.entries.some(function(e){return e.loggedBy===u.username;});
      var isAdmin = u.role === "admin";
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td>'+escapeHtml(u.username)+'</td>'+
        '<td>'+(isAdmin?t('opt_role_admin'):t('opt_role_staff'))+'</td>'+
        '<td><span class="badge '+(u.active?'active':'inactive')+'">'+(u.active?t('badge_active'):t('badge_inactive'))+'</span></td>'+
        '<td></td>';
      var actionsTd = tr.children[3];

      var resetBtn = document.createElement("button");
      resetBtn.className = "small";
      resetBtn.textContent = t("btn_reset_password");
      resetBtn.onclick = function(){
        if(!requireAdmin()) return;
        var newPass = prompt(t("prompt_new_password", {name: u.username}));
        if(newPass === null) return;
        if(!newPass.trim()){ alert(t("alert_enter_password")); return; }
        u.password = newPass;
        save();
      };
      actionsTd.appendChild(resetBtn);

      var roleBtn = document.createElement("button");
      roleBtn.className = "small";
      roleBtn.style.marginLeft = "6px";
      roleBtn.textContent = isAdmin ? t("btn_make_staff") : t("btn_make_admin");
      roleBtn.onclick = function(){
        if(!requireAdmin()) return;
        if(isAdmin){
          if(isLastActiveAdmin(u)){ alert(t("alert_last_admin")); return; }
          var current = getCurrentUser();
          if(current && current.id === u.id && !confirm(t("confirm_remove_own_admin"))) return;
          u.role = "staff";
        } else {
          u.role = "admin";
        }
        save(); renderStaff();
      };
      actionsTd.appendChild(roleBtn);

      var toggleBtn = document.createElement("button");
      toggleBtn.className = "small";
      toggleBtn.style.marginLeft = "6px";
      toggleBtn.textContent = u.active ? t("btn_deactivate") : t("btn_activate");
      toggleBtn.onclick = function(){
        if(!requireAdmin()) return;
        if(u.active && isLastActiveAdmin(u)){ alert(t("alert_last_admin")); return; }
        u.active = !u.active; save(); renderStaff();
      };
      actionsTd.appendChild(toggleBtn);

      if(!hasEntries){
        var delBtn = document.createElement("button");
        delBtn.className = "small";
        delBtn.style.marginLeft = "6px";
        delBtn.textContent = t("btn_delete");
        delBtn.onclick = function(){
          if(!requireAdmin()) return;
          if(isLastActiveAdmin(u)){ alert(t("alert_last_admin")); return; }
          if(confirm(t("confirm_delete_staff", {name:u.username}))){
            data.users = data.users.filter(function(x){return x.id!==u.id;});
            save(); renderStaff();
          }
        };
        actionsTd.appendChild(delBtn);
      }
      tbody.appendChild(tr);
    });
  }

  document.getElementById("btnAddStaff").addEventListener("click", function(){
    if(!requireAdmin()) return;
    var usernameInput = document.getElementById("newStaffUsername");
    var passwordInput = document.getElementById("newStaffPassword");
    var roleSelect = document.getElementById("newStaffRole");
    var username = usernameInput.value.trim();
    var password = passwordInput.value;
    if(!username){ alert(t("alert_enter_username")); return; }
    if(!password){ alert(t("alert_enter_password")); return; }
    var dup = data.users.some(function(u){return u.username.toLowerCase()===username.toLowerCase();});
    if(dup){ alert(t("alert_username_taken", {name:username})); return; }
    var isBootstrap = data.users.length === 0;
    var role = isBootstrap ? "admin" : roleSelect.value;
    data.users.push({id:uid(), username:username, password:password, active:true, role:role});
    save();
    usernameInput.value = "";
    passwordInput.value = "";
    roleSelect.value = "staff";
    renderStaff();
  });

  function uid(){
    return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  }

  function defaultData(){
    return { members: [], items: [], entries: [], users: [], settings: { currency: "₪", printFood: false, printDrinks: false, printerTarget: "" } };
  }

  function load(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return defaultData();
      var parsed = JSON.parse(raw);
      if(!parsed.settings) parsed.settings = { currency: "₪" };
      if(parsed.settings.printFood===undefined) parsed.settings.printFood = false;
      if(parsed.settings.printDrinks===undefined) parsed.settings.printDrinks = false;
      if(parsed.settings.printerTarget===undefined) parsed.settings.printerTarget = "";
      if(!parsed.members) parsed.members = [];
      if(!parsed.items) parsed.items = [];
      if(!parsed.entries) parsed.entries = [];
      if(!parsed.users) parsed.users = [];
      // migrate older data that predates member numbers / stock
      parsed.members.forEach(function(m){ if(m.number===undefined) m.number = ""; });
      parsed.items.forEach(function(it){
        if(it.stock===undefined) it.stock = 0;
        if(it.extras===undefined) it.extras = [];
      });
      // migrate staff accounts that predate roles - default to "staff",
      // but make sure at least one active Admin exists so nobody gets
      // locked out of staff management.
      parsed.users.forEach(function(u){ if(u.role===undefined) u.role = "staff"; });
      var hasActiveAdmin = parsed.users.some(function(u){ return u.role==="admin" && u.active; });
      if(!hasActiveAdmin && parsed.users.length > 0){
        var candidate = parsed.users.find(function(u){ return u.active; }) || parsed.users[0];
        candidate.role = "admin";
      }
      return parsed;
    }catch(e){
      alert("Could not read saved data, starting fresh. (" + e.message + ")");
      return defaultData();
    }
  }

  function save(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    // Also mirror to disk via the local server, if it's running (i.e. the
    // app was opened through "Start Pub Tracker.bat"). This keeps a
    // current-data.json file always up to date in the app's folder, so
    // the monthly report script always has fresh data without anyone
    // needing to click "Download Backup" first. Silently does nothing
    // if the app was just opened as a plain file instead.
    try{
      fetch("/api/save", {
        method: "POST",
        headers: {"Content-Type": "application/json; charset=utf-8"},
        body: JSON.stringify(data)
      }).catch(function(){});
    }catch(e){}
  }

  var data = load();

  function money(n){
    return (Math.round(n*100)/100).toFixed(2);
  }
  function currency(){
    return data.settings.currency || "";
  }

  // ---------- Navigation ----------
  var navButtons = document.querySelectorAll("nav button");
  navButtons.forEach(function(btn){
    btn.addEventListener("click", function(){
      if(!isViewAllowed(btn.dataset.view)){ goToLogView(); return; }
      navButtons.forEach(function(b){ b.classList.remove("active"); });
      btn.classList.add("active");
      document.querySelectorAll("section.view").forEach(function(s){ s.classList.remove("active"); });
      document.getElementById("view-" + btn.dataset.view).classList.add("active");
      if(btn.dataset.view === "members") renderMembers();
      if(btn.dataset.view === "menu") renderMenu();
      if(btn.dataset.view === "log") renderLog();
      if(btn.dataset.view === "backup") { renderBackupStatus(); renderPrinterSettings(); }
      if(btn.dataset.view === "staff") renderStaff();
      if(btn.dataset.view === "calendar") renderCalendar();
    });
  });

  var langToggleBtn = document.getElementById("btnLangToggle");
  if(langToggleBtn){
    langToggleBtn.addEventListener("click", function(){
      setLang(getLang() === "he" ? "en" : "he");
    });
  }

  // ---------- CSV helpers ----------
  function csvField(v){
    v = (v === undefined || v === null) ? "" : String(v);
    if(/[",\n]/.test(v)){
      v = '"' + v.replace(/"/g,'""') + '"';
    }
    return v;
  }
  function downloadCsv(filename, rows){
    var content = rows.map(function(r){ return r.map(csvField).join(","); }).join("\r\n");
    var blob = new Blob(["﻿" + content], {type:"text/csv;charset=utf-8;"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function downloadJson(filename, obj){
    var blob = new Blob([JSON.stringify(obj,null,2)], {type:"application/json"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ================= MEMBERS =================
  function renderMembers(){
    var tbody = document.querySelector("#membersTable tbody");
    tbody.innerHTML = "";
    data.members.slice().sort(function(a,b){return (a.number||"").localeCompare(b.number||"", undefined, {numeric:true});}).forEach(function(m){
      var hasEntries = data.entries.some(function(e){return e.memberId===m.id;});
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td></td>'+
        '<td></td>'+
        '<td><span class="badge '+(m.active?'active':'inactive')+'">'+(m.active?t('badge_active'):t('badge_inactive'))+'</span></td>'+
        '<td></td>';

      var numberTd = tr.children[0];
      var numberInput = document.createElement("input");
      numberInput.type = "text";
      numberInput.value = m.number;
      numberInput.style.width = "80px";
      numberTd.appendChild(numberInput);

      var nameTd = tr.children[1];
      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = m.name;
      nameInput.style.width = "160px";
      nameTd.appendChild(nameInput);

      var editSaveBtn = document.createElement("button");
      editSaveBtn.className = "small";
      editSaveBtn.style.marginLeft = "6px";
      editSaveBtn.textContent = t("btn_save");
      editSaveBtn.onclick = function(){
        var newNumber = numberInput.value.trim();
        var newName = nameInput.value.trim();
        if(!newNumber){ alert(t("alert_member_number_empty")); return; }
        if(!newName){ alert(t("alert_member_name_empty")); return; }
        var dup = data.members.some(function(x){return x.id!==m.id && x.number.toLowerCase()===newNumber.toLowerCase();});
        if(dup){ alert(t("alert_member_number_taken_other", {num:newNumber})); return; }
        m.number = newNumber;
        m.name = newName;
        save();
        renderMembers();
        renderLog();
      };
      nameTd.appendChild(editSaveBtn);

      var actionsTd = tr.children[3];
      var toggleBtn = document.createElement("button");
      toggleBtn.className = "small";
      toggleBtn.textContent = m.active ? t("btn_deactivate") : t("btn_activate");
      toggleBtn.onclick = function(){ m.active = !m.active; save(); renderMembers(); renderLog(); };
      actionsTd.appendChild(toggleBtn);
      if(!hasEntries){
        var delBtn = document.createElement("button");
        delBtn.className = "small";
        delBtn.style.marginLeft="6px";
        delBtn.textContent = t("btn_delete");
        delBtn.onclick = function(){
          if(confirm(t("confirm_delete_member", {name:m.name}))){
            data.members = data.members.filter(function(x){return x.id!==m.id;});
            save(); renderMembers(); renderLog();
          }
        };
        actionsTd.appendChild(delBtn);
      }
      tbody.appendChild(tr);
    });
  }

  document.getElementById("btnAddMember").addEventListener("click", function(){
    var numberInput = document.getElementById("newMemberNumber");
    var nameInput = document.getElementById("newMemberName");
    var number = numberInput.value.trim();
    var name = nameInput.value.trim();
    if(!number){ alert(t("alert_enter_member_number")); return; }
    if(!name){ alert(t("alert_enter_member_name")); return; }
    var dup = data.members.some(function(m){return m.number.toLowerCase()===number.toLowerCase();});
    if(dup){ alert(t("alert_member_number_in_use", {num:number})); return; }
    data.members.push({id:uid(), number:number, name:name, active:true});
    save();
    numberInput.value = "";
    nameInput.value = "";
    renderMembers();
    renderLog();
  });

  // ---------- CSV import (bulk add members) ----------
  function parseCsv(text){
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    for(var i=0;i<text.length;i++){
      var c = text[i];
      if(inQuotes){
        if(c === '"'){
          if(text[i+1] === '"'){ field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += c;
        }
      } else {
        if(c === '"'){
          inQuotes = true;
        } else if(c === ','){
          row.push(field); field = "";
        } else if(c === '\r'){
          // ignore - line break is handled on \n
        } else if(c === '\n'){
          row.push(field); field = "";
          rows.push(row); row = [];
        } else {
          field += c;
        }
      }
    }
    if(field.length > 0 || row.length > 0){
      row.push(field);
      rows.push(row);
    }
    rows = rows.filter(function(r){ return r.some(function(c){ return c.trim() !== ""; }); });
    return rows;
  }

  function looksNumeric(s){
    s = (s||"").trim();
    if(!s) return false;
    return /^[0-9]+$/.test(s.replace(/[\s\-]/g,""));
  }

  function detectMemberColumns(rows){
    var numberKeywords = ["number","num","acct","account","id","#","מספר"];
    var nameKeywords = ["name","שם"];
    var header = rows[0].map(function(c){ return (c||"").trim().toLowerCase(); });
    var numberCol = -1, nameCol = -1;
    header.forEach(function(h, idx){
      if(numberCol===-1 && numberKeywords.some(function(k){ return h.indexOf(k)!==-1; })) numberCol = idx;
      if(nameCol===-1 && nameKeywords.some(function(k){ return h.indexOf(k)!==-1; })) nameCol = idx;
    });
    var hasHeader = (numberCol!==-1 || nameCol!==-1);
    var dataRows = hasHeader ? rows.slice(1) : rows.slice();

    if(numberCol===-1 || nameCol===-1){
      var col0Numeric = 0, col1Numeric = 0, total = 0;
      dataRows.forEach(function(r){
        if(r.length < 2) return;
        total++;
        if(looksNumeric(r[0])) col0Numeric++;
        if(looksNumeric(r[1])) col1Numeric++;
      });
      if(total > 0 && col1Numeric > col0Numeric){
        numberCol = 1; nameCol = 0;
      } else {
        numberCol = 0; nameCol = 1;
      }
    }
    return { numberCol: numberCol, nameCol: nameCol, dataRows: dataRows };
  }

  document.getElementById("btnPreviewImport").addEventListener("click", function(){
    var fileInput = document.getElementById("importMembersFile");
    var file = fileInput.files[0];
    if(!file){ alert(t("alert_choose_csv")); return; }
    var reader = new FileReader();
    reader.onload = function(e){
      try{
        var rows = parseCsv(e.target.result);
        if(rows.length===0){ alert(t("alert_csv_empty")); return; }
        var detected = detectMemberColumns(rows);

        var existingNumbers = {};
        data.members.forEach(function(m){ existingNumbers[m.number.toLowerCase()] = true; });
        var seenNumbers = {};

        var parsed = detected.dataRows.map(function(r){
          var number = (r[detected.numberCol]||"").trim();
          var name = (r[detected.nameCol]||"").trim();
          var status;
          if(!number || !name){
            status = t("status_missing_data");
          } else if(existingNumbers[number.toLowerCase()]){
            status = t("status_already_member");
          } else if(seenNumbers[number.toLowerCase()]){
            status = t("status_duplicate_in_file");
          } else {
            status = t("status_ok");
            seenNumbers[number.toLowerCase()] = true;
          }
          return { number: number, name: name, status: status, ok: status === t("status_ok") };
        });

        renderImportPreview(parsed);
      }catch(err){
        alert(t("alert_csv_read_error", {msg: err.message}));
      }
    };
    reader.readAsText(file, "UTF-8");
  });

  function renderImportPreview(parsed){
    var box = document.getElementById("importPreviewBox");
    var okCount = parsed.filter(function(p){ return p.ok; }).length;
    var skipCount = parsed.length - okCount;
    var html = '<p class="muted">' + t("import_found_rows", {n:parsed.length, ok:okCount, skip:skipCount}) + '</p>';
    html += '<table><thead><tr><th>'+t("th_member_num")+'</th><th>'+t("th_name")+'</th><th>'+t("th_status")+'</th></tr></thead><tbody>';
    parsed.slice(0,25).forEach(function(p){
      html += '<tr><td>'+escapeHtml(p.number)+'</td><td>'+escapeHtml(p.name)+'</td><td>'+escapeHtml(p.status)+'</td></tr>';
    });
    html += '</tbody></table>';
    if(parsed.length > 25){ html += '<p class="muted">' + t("import_more_rows", {n: parsed.length-25}) + '</p>'; }
    html += '<div class="row" style="margin-top:10px;">' +
            '<button class="btn" id="btnConfirmImport">' + t("btn_import_n_members", {n:okCount}) + '</button>' +
            '<button class="btn secondary" id="btnCancelImport">' + t("btn_cancel") + '</button>' +
            '</div>';
    box.innerHTML = html;

    document.getElementById("btnConfirmImport").addEventListener("click", function(){
      var added = 0;
      parsed.forEach(function(p){
        if(p.ok){
          data.members.push({id:uid(), number:p.number, name:p.name, active:true});
          added++;
        }
      });
      save();
      renderMembers();
      renderLog();
      box.innerHTML = "";
      document.getElementById("importMembersFile").value = "";
      alert(t("alert_imported_members", {n:added}));
    });

    document.getElementById("btnCancelImport").addEventListener("click", function(){
      box.innerHTML = "";
      document.getElementById("importMembersFile").value = "";
    });
  }

  // ================= MENU =================
  function renderMenu(){
    document.getElementById("currencySymbol").value = currency();
    var tbody = document.querySelector("#menuTable tbody");
    tbody.innerHTML = "";
    data.items.slice().sort(function(a,b){
      if(a.category!==b.category) return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    }).forEach(function(it){
      var hasEntries = data.entries.some(function(e){return e.itemId===it.id;});
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td></td>'+
        '<td>'+escapeHtml(it.name)+'</td>'+
        '<td>'+escapeHtml(it.category)+'</td>'+
        '<td></td>'+
        '<td></td>'+
        '<td></td>'+
        '<td><span class="badge '+(it.active?'active':'inactive')+'">'+(it.active?t('badge_active'):t('badge_inactive'))+'</span></td>'+
        '<td></td>';

      var imageTd = tr.children[0];
      if(it.image){
        var thumb = document.createElement("img");
        thumb.className = "item-thumb";
        thumb.src = "images/" + it.image + "?v=" + (it.imageVersion||0);
        thumb.alt = it.name;
        imageTd.appendChild(thumb);
      } else {
        var noImg = document.createElement("span");
        noImg.className = "muted";
        noImg.textContent = "—";
        imageTd.appendChild(noImg);
      }
      var imgInput = document.createElement("input");
      imgInput.type = "file"; imgInput.accept = "image/*";
      imgInput.style.display = "block"; imgInput.style.marginTop = "4px"; imgInput.style.fontSize = "0.75em"; imgInput.style.width = "90px";
      imgInput.onchange = function(){
        var file = imgInput.files && imgInput.files[0];
        if(!file) return;
        if(file.size > 3*1024*1024){ alert(t("alert_image_too_large")); imgInput.value=""; return; }
        var fr = new FileReader();
        fr.onload = function(){
          var dataUrl = fr.result;
          var base64 = dataUrl.split(",")[1];
          fetch("/api/upload-image", {
            method: "POST",
            headers: {"Content-Type": "application/json; charset=utf-8"},
            body: JSON.stringify({itemId: it.id, filename: file.name, dataBase64: base64})
          }).then(function(res){ return res.json(); }).then(function(resJson){
            if(resJson && resJson.ok){
              it.image = resJson.filename;
              it.imageVersion = (it.imageVersion||0) + 1;
              save();
              renderMenu();
              updateLogItemPreview();
            } else {
              alert(t("alert_image_upload_failed"));
            }
          }).catch(function(){ alert(t("alert_image_upload_failed")); });
        };
        fr.readAsDataURL(file);
      };
      imageTd.appendChild(imgInput);

      var priceTd = tr.children[3];
      var priceInput = document.createElement("input");
      priceInput.type="number"; priceInput.min="0"; priceInput.step="0.5";
      priceInput.style.width="80px";
      priceInput.value = it.price;
      var saveBtn = document.createElement("button");
      saveBtn.className="small"; saveBtn.style.marginLeft="6px"; saveBtn.textContent=t("btn_save");
      saveBtn.onclick = function(){
        var val = parseFloat(priceInput.value);
        if(isNaN(val) || val<0){ alert(t("alert_enter_valid_price")); return; }
        it.price = val; save(); renderLog();
        saveBtn.textContent=t("btn_saved"); setTimeout(function(){saveBtn.textContent=t("btn_save");},900);
      };
      priceTd.appendChild(priceInput); priceTd.appendChild(saveBtn);

      var stockTd = tr.children[4];
      var stockInput = document.createElement("input");
      stockInput.type="number"; stockInput.step="1";
      stockInput.style.width="70px";
      stockInput.value = it.stock;
      if(it.stock<=0) stockTd.style.color = "var(--danger-dark)";
      var stockSaveBtn = document.createElement("button");
      stockSaveBtn.className="small"; stockSaveBtn.style.marginLeft="6px"; stockSaveBtn.textContent=t("btn_save");
      stockSaveBtn.onclick = function(){
        var val = parseInt(stockInput.value, 10);
        if(isNaN(val)){ alert(t("alert_enter_valid_stock")); return; }
        it.stock = val; save(); renderMenu(); renderLog();
      };
      stockTd.appendChild(stockInput); stockTd.appendChild(stockSaveBtn);

      var extrasTd = tr.children[5];
      if(!it.extras) it.extras = [];
      var extrasList = document.createElement("div");
      extrasList.className = "extras-chip-list";
      it.extras.forEach(function(ex, idx){
        var chip = document.createElement("span");
        chip.className = "extra-chip";
        chip.textContent = ex.name + " (+" + currency() + money(ex.price) + ")";
        var rmBtn = document.createElement("button");
        rmBtn.type = "button"; rmBtn.className = "extra-chip-remove"; rmBtn.textContent = "×";
        rmBtn.onclick = function(){
          it.extras.splice(idx, 1);
          save(); renderMenu(); updateLogItemExtras();
        };
        chip.appendChild(rmBtn);
        extrasList.appendChild(chip);
      });
      extrasTd.appendChild(extrasList);

      var extraForm = document.createElement("div");
      extraForm.className = "extra-add-form";
      var exNameInput = document.createElement("input");
      exNameInput.type = "text"; exNameInput.placeholder = t("placeholder_extra_name");
      var exPriceInput = document.createElement("input");
      exPriceInput.type = "number"; exPriceInput.min = "0"; exPriceInput.step = "0.5";
      exPriceInput.placeholder = t("placeholder_extra_price");
      var exAddBtn = document.createElement("button");
      exAddBtn.type = "button"; exAddBtn.className = "small"; exAddBtn.textContent = t("btn_add_extra");
      exAddBtn.onclick = function(){
        var exName = exNameInput.value.trim();
        var exPrice = parseFloat(exPriceInput.value);
        if(!exName){ alert(t("alert_enter_extra_name")); return; }
        if(isNaN(exPrice) || exPrice<0){ alert(t("alert_enter_valid_price")); return; }
        it.extras.push({id: uid(), name: exName, price: exPrice});
        save(); renderMenu(); updateLogItemExtras();
      };
      extraForm.appendChild(exNameInput);
      extraForm.appendChild(exPriceInput);
      extraForm.appendChild(exAddBtn);
      extrasTd.appendChild(extraForm);

      var actionsTd = tr.children[7];
      var toggleBtn = document.createElement("button");
      toggleBtn.className="small";
      toggleBtn.textContent = it.active ? t("btn_deactivate") : t("btn_activate");
      toggleBtn.onclick = function(){ it.active=!it.active; save(); renderMenu(); renderLog(); };
      actionsTd.appendChild(toggleBtn);
      if(!hasEntries){
        var delBtn = document.createElement("button");
        delBtn.className="small"; delBtn.style.marginLeft="6px"; delBtn.textContent=t("btn_delete");
        delBtn.onclick = function(){
          if(confirm(t("confirm_delete_item", {name:it.name}))){
            data.items = data.items.filter(function(x){return x.id!==it.id;});
            save(); renderMenu(); renderLog();
          }
        };
        actionsTd.appendChild(delBtn);
      }
      tbody.appendChild(tr);
    });
  }

  document.getElementById("btnAddItem").addEventListener("click", function(){
    var name = document.getElementById("newItemName").value.trim();
    var category = document.getElementById("newItemCategory").value;
    var price = parseFloat(document.getElementById("newItemPrice").value);
    var stockRaw = document.getElementById("newItemStock").value;
    var stock = stockRaw === "" ? 0 : parseInt(stockRaw, 10);
    if(!name){ alert(t("alert_enter_item_name")); return; }
    if(isNaN(price) || price<0){ alert(t("alert_enter_valid_price")); return; }
    if(isNaN(stock) || stock<0){ alert(t("alert_enter_valid_starting_stock")); return; }
    data.items.push({id:uid(), name:name, category:category, price:price, stock:stock, active:true, extras: []});
    save();
    document.getElementById("newItemName").value="";
    document.getElementById("newItemPrice").value="";
    document.getElementById("newItemStock").value="0";
    renderMenu();
    renderLog();
  });

  document.getElementById("btnSaveCurrency").addEventListener("click", function(){
    var sym = document.getElementById("currencySymbol").value.trim();
    data.settings.currency = sym;
    save();
    renderLog(); renderMenu();
  });

  // ================= LOG =================
  function matchesQuery(text, query){
    query = (query||"").trim().toLowerCase();
    if(!query) return true;
    return String(text).toLowerCase().indexOf(query) !== -1;
  }

  function fillLogDropdowns(){
    var memberQuery = document.getElementById("searchMember").value;
    var itemQuery = document.getElementById("searchItem").value;

    var memberSel = document.getElementById("logMember");
    var prevMember = memberSel.value;
    memberSel.innerHTML = "";
    var filteredMembers = data.members.filter(function(m){return m.active && matchesQuery(m.number + " " + m.name, memberQuery);})
      .sort(function(a,b){return (a.number||"").localeCompare(b.number||"", undefined, {numeric:true});});
    if(filteredMembers.length===0){
      var noneOpt = document.createElement("option");
      noneOpt.value = ""; noneOpt.textContent = t("no_matching_members");
      memberSel.appendChild(noneOpt);
    } else {
      filteredMembers.forEach(function(m){
        var opt = document.createElement("option");
        opt.value = m.id; opt.textContent = m.number + " - " + m.name;
        memberSel.appendChild(opt);
      });
    }
    if(prevMember) memberSel.value = prevMember;

    var itemSel = document.getElementById("logItem");
    var prevItem = itemSel.value;
    itemSel.innerHTML = "";
    var anyItems = false;
    ["Drink","Food","Event","Other"].forEach(function(cat){
      var group = data.items.filter(function(it){return it.active && it.category===cat && matchesQuery(it.name, itemQuery);});
      if(group.length===0) return;
      anyItems = true;
      var optgroup = document.createElement("optgroup");
      var catKey = cat==="Drink" ? "opt_drink" : (cat==="Food" ? "opt_food" : (cat==="Event" ? "opt_event" : "opt_other"));
      optgroup.label = t(catKey);
      group.sort(function(a,b){return a.name.localeCompare(b.name);}).forEach(function(it){
        var opt = document.createElement("option");
        opt.value = it.id;
        // Events aren't stocked goods - logging one never takes anything out
        // of the cellar - so they get no stock count and, importantly, are
        // never labelled "out of stock".
        var stockLabel = (it.category === "Event") ? ""
          : (it.stock<=0 ? t("out_of_stock_suffix") : t("stock_suffix", {n: it.stock}));
        opt.textContent = it.name + " (" + currency() + money(it.price) + stockLabel + ")";
        optgroup.appendChild(opt);
      });
      itemSel.appendChild(optgroup);
    });
    if(!anyItems){
      var noneItemOpt = document.createElement("option");
      noneItemOpt.value = ""; noneItemOpt.textContent = t("no_matching_items");
      itemSel.appendChild(noneItemOpt);
    }
    if(prevItem) itemSel.value = prevItem;
    updateLogItemPreview();
    updateLogItemExtras();
    updateLogEventFields();
  }

  function updateLogItemPreview(){
    var itemSel = document.getElementById("logItem");
    var preview = document.getElementById("logItemPreview");
    var it = data.items.find(function(x){return x.id===itemSel.value;});
    if(it && it.image){
      preview.src = "images/" + it.image + "?v=" + (it.imageVersion||0);
      preview.alt = it.name;
      preview.style.display = "block";
    } else {
      preview.style.display = "none";
      preview.src = "";
    }
  }

  function updateLogItemExtras(){
    var itemSel = document.getElementById("logItem");
    var field = document.getElementById("logExtrasField");
    var box = document.getElementById("logExtrasBox");
    box.innerHTML = "";
    var it = data.items.find(function(x){return x.id===itemSel.value;});
    var extras = (it && it.extras) ? it.extras : [];
    if(extras.length===0){
      field.style.display = "none";
    } else {
      field.style.display = "";
      extras.forEach(function(ex){
        var label = document.createElement("label");
        label.className = "extra-pill";
        var cb = document.createElement("input");
        cb.type = "checkbox"; cb.value = ex.id;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(" " + ex.name + " (+" + currency() + money(ex.price) + ")"));
        box.appendChild(label);
      });
    }
    updateLogPriceSummary();
  }

  function updateLogPriceSummary(){
    var itemSel = document.getElementById("logItem");
    var summary = document.getElementById("logPriceSummary");
    var it = data.items.find(function(x){return x.id===itemSel.value;});
    if(!it){ summary.textContent = ""; return; }
    var qtyRaw = parseInt(document.getElementById("logQty").value, 10);
    var qty = (isNaN(qtyRaw) || qtyRaw<1) ? 1 : qtyRaw;
    var extrasTotal = 0;
    document.querySelectorAll("#logExtrasBox input[type=checkbox]:checked").forEach(function(cb){
      var ex = (it.extras||[]).find(function(x){return x.id===cb.value;});
      if(ex) extrasTotal += ex.price;
    });
    var unitPrice = it.price + extrasTotal;
    var lineTotal = unitPrice * qty;
    var text = t("price_per_item", {price: currency()+money(unitPrice)});
    if(qty > 1){
      text += " · " + t("price_line_total", {total: currency()+money(lineTotal)});
    }
    summary.textContent = text;
  }

  function updateLogEventFields(){
    var itemSel = document.getElementById("logItem");
    var it = data.items.find(function(x){return x.id===itemSel.value;});
    var isEvent = !!(it && it.category === "Event");
    document.getElementById("logEventDateField").style.display = isEvent ? "" : "none";
    document.getElementById("logEventStartField").style.display = isEvent ? "" : "none";
    document.getElementById("logEventEndField").style.display = isEvent ? "" : "none";
  }

  document.getElementById("searchMember").addEventListener("input", fillLogDropdowns);
  document.getElementById("searchItem").addEventListener("input", fillLogDropdowns);
  document.getElementById("logItem").addEventListener("change", function(){
    updateLogItemPreview();
    updateLogItemExtras();
    updateLogEventFields();
  });
  document.getElementById("logExtrasBox").addEventListener("change", updateLogPriceSummary);
  document.getElementById("logQty").addEventListener("input", updateLogPriceSummary);

  function renderLog(){
    fillLogDropdowns();
    var hint = document.getElementById("logHint");
    if(data.members.filter(function(m){return m.active;}).length===0 || data.items.filter(function(it){return it.active;}).length===0){
      hint.style.display="block";
      hint.textContent = t("hint_add_member_item");
    } else {
      hint.style.display="none";
    }

    var dateInput = document.getElementById("logDate");
    if(!dateInput.value) setDateField("logDate", todayStr());
    var selDate = getDateField("logDate") || "";

    var tbody = document.querySelector("#logTable tbody");
    tbody.innerHTML = "";
    var dayTotal = 0;
    data.entries.filter(function(e){return e.date===selDate;})
      .sort(function(a,b){return a.ts-b.ts;})
      .forEach(function(e){
        var lineTotal = entryLineTotal(e);
        dayTotal += lineTotal;
        var member = data.members.find(function(m){return m.id===e.memberId;});
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td>'+new Date(e.ts).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})+'</td>'+
          '<td>'+escapeHtml(member?member.number:"")+'</td>'+
          '<td>'+escapeHtml(member?member.name:t("removed_member"))+'</td>'+
          '<td>'+escapeHtml(e.itemName)+escapeHtml(entryExtrasSuffix(e))+escapeHtml(entryEventSuffix(e))+'</td>'+
          '<td>'+e.qty+'</td>'+
          '<td>'+currency()+money(e.unitPrice)+'</td>'+
          '<td>'+currency()+money(lineTotal)+'</td>'+
          '<td>'+escapeHtml(e.loggedBy||"-")+'</td>'+
          '<td></td>';
        if(data.settings.printFood || data.settings.printDrinks){
          var reprintBtn = document.createElement("button");
          reprintBtn.className="small"; reprintBtn.style.marginRight="6px";
          reprintBtn.textContent=t("btn_reprint");
          reprintBtn.onclick = function(){
            reprintBtn.textContent = t("printer_printing");
            sendKitchenTicket(ticketPayloadFromEntry(e)).then(function(resJson){
              reprintBtn.textContent = (resJson && resJson.ok) ? t("printer_printed_ok") : t("printer_printed_fail");
              setTimeout(function(){ reprintBtn.textContent = t("btn_reprint"); }, 2500);
            }).catch(function(){
              reprintBtn.textContent = t("printer_printed_fail");
              setTimeout(function(){ reprintBtn.textContent = t("btn_reprint"); }, 2500);
            });
          };
          tr.children[8].appendChild(reprintBtn);
        }
        var delBtn = document.createElement("button");
        delBtn.className="small"; delBtn.textContent=t("btn_delete");
        delBtn.onclick = function(){
          if(confirm(t("confirm_remove_entry"))){
            var relatedItem = data.items.find(function(x){return x.id===e.itemId;});
            // Events never took stock out (see the Add handler), so they must
            // not put any back in when removed - only real goods do.
            if(relatedItem && e.category !== "Event") relatedItem.stock += e.qty;
            data.entries = data.entries.filter(function(x){return x.id!==e.id;});
            save(); renderLog(); renderCalendar();
          }
        };
        tr.children[8].appendChild(delBtn);
        tbody.appendChild(tr);
      });
    document.getElementById("logDayTotal").textContent = currency() + money(dayTotal);
  }


  document.getElementById("btnAddEntry").addEventListener("click", function(){
    var date = getDateField("logDate");
    var memberId = document.getElementById("logMember").value;
    var itemId = document.getElementById("logItem").value;
    var qty = parseInt(document.getElementById("logQty").value, 10);
    if(date === null){ alert(t("alert_invalid_date")); return; }
    if(!date){ alert(t("alert_pick_date")); return; }
    if(!memberId){ alert(t("alert_select_member")); return; }
    if(!itemId){ alert(t("alert_select_item")); return; }
    if(isNaN(qty) || qty<1){ alert(t("alert_enter_valid_qty")); return; }
    var item = data.items.find(function(it){return it.id===itemId;});
    var isEvent = item.category === "Event";
    var eventDate = getDateField("logEventDate");
    var eventStart = getTimeField("logEventStart");
    var eventEnd = getTimeField("logEventEnd");
    if(isEvent){
      if(eventDate === null){ alert(t("alert_invalid_date")); return; }
      if(eventStart === null || eventEnd === null){ alert(t("alert_invalid_time")); return; }
      if(!eventDate){ alert(t("alert_event_date_required")); return; }
      if(!eventStart || !eventEnd){ alert(t("alert_event_time_required")); return; }
      if(eventEnd <= eventStart){ alert(t("alert_event_end_before_start")); return; }
    }
    if(!isEvent && item.stock - qty < 0){
      var proceed = confirm(t("confirm_low_stock", {n:item.stock, item:item.name}));
      if(!proceed) return;
    }
    if(!isEvent) item.stock -= qty;
    var loggedInUser = getCurrentUser();
    var chosenExtras = [];
    document.querySelectorAll("#logExtrasBox input[type=checkbox]:checked").forEach(function(cb){
      var ex = (item.extras||[]).find(function(x){return x.id===cb.value;});
      if(ex) chosenExtras.push({name: ex.name, price: ex.price});
    });
    var newEntry = {
      id: uid(),
      memberId: memberId,
      itemId: itemId,
      itemName: item.name,
      category: item.category,
      unitPrice: item.price,
      extras: chosenExtras,
      qty: qty,
      date: date,
      ts: Date.now(),
      loggedBy: loggedInUser ? loggedInUser.username : ""
    };
    if(isEvent){
      newEntry.eventDate = eventDate;
      newEntry.eventStart = eventStart;
      newEntry.eventEnd = eventEnd;
    }
    data.entries.push(newEntry);
    save();
    document.getElementById("logQty").value = "1";
    setDateField("logEventDate", "");
    setTimeField("logEventStart", "");
    setTimeField("logEventEnd", "");
    renderLog();
    renderMenu();
    if(isEvent) renderCalendar();
    maybeAutoPrintTicket(newEntry);
  });

  function maybeAutoPrintTicket(e){
    var shouldPrint = (e.category === "Food" && data.settings.printFood) ||
                       (e.category === "Drink" && data.settings.printDrinks);
    if(!shouldPrint) return;
    var statusEl = document.getElementById("logPrintStatus");
    statusEl.textContent = t("printer_printing");
    sendKitchenTicket(ticketPayloadFromEntry(e)).then(function(resJson){
      statusEl.textContent = (resJson && resJson.ok) ? t("printer_printed_ok") : t("printer_printed_fail");
      setTimeout(function(){ statusEl.textContent = ""; }, 4000);
    }).catch(function(){
      statusEl.textContent = t("printer_printed_fail");
      setTimeout(function(){ statusEl.textContent = ""; }, 4000);
    });
  }

  function todayStr(){
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
  }
  function pad(n){ return n<10 ? "0"+n : ""+n; }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }

  // Extras (toppings/add-ons) are snapshotted onto each entry at the time
  // it's logged - {name, price} - so later edits to an item's extras list
  // never change the price of a night that's already been charged.
  function entryExtrasTotal(e){
    return (e.extras||[]).reduce(function(sum,ex){ return sum + (ex.price||0); }, 0);
  }
  function entryLineTotal(e){
    return e.qty * (e.unitPrice + entryExtrasTotal(e));
  }
  function entryExtrasSuffix(e){
    var ex = e.extras||[];
    if(ex.length===0) return "";
    return " (+" + ex.map(function(x){return x.name;}).join(", ") + ")";
  }
  // forScreen wraps the range in \u2066/\u2069 so a right-to-left page doesn't
  // render "20:00-23:00" back-to-front. CSV files ask for the plain version -
  // those control characters have no business in an exported spreadsheet.
  function timeRangeText(start, end, forScreen){
    if(!start) return "";
    var range = start + (end ? "–" + end : "");
    return forScreen ? "\u2066" + range + "\u2069" : range;
  }
  function entryEventSuffix(e, forScreen){
    if(!e.eventDate) return "";
    var range = timeRangeText(e.eventStart, e.eventEnd, forScreen !== false);
    return " [" + t("event_suffix_label") + " " + displayDate(e.eventDate) + (range ? " " + range : "") + "]";
  }



  // ================= DATE & TIME FIELDS =================
  // Chrome renders a native <input type="date"/"time"> according to the
  // *browser's* own language setting, not the page's - which is why the
  // time boxes were showing an AM/PM slot on an English Chrome. A page
  // cannot override that, so these are plain text boxes that we format
  // ourselves: always dd/mm/yyyy and a 24-hour HH:MM, in every browser
  // and in both app languages. Entries are still stored the same way as
  // before (YYYY-MM-DD and HH:MM), so nothing downstream changes.

  function digitsOf(str){ return String(str || "").replace(/\D/g, ""); }

  // ---- time: "HH:MM", 00:00 - 23:59 ----
  function normalizeTime(raw){
    var d = digitsOf(raw);
    var hh, mm;
    if(d.length === 1){ hh = "0" + d;            mm = "00"; }
    else if(d.length === 2){ hh = d;             mm = "00"; }
    else if(d.length === 3){ hh = "0" + d.charAt(0); mm = d.slice(1); }
    else if(d.length === 4){ hh = d.slice(0,2);  mm = d.slice(2); }
    else return null;
    if(Number(hh) > 23 || Number(mm) > 59) return null;
    return hh + ":" + mm;
  }
  function maskTime(raw){
    var d = digitsOf(raw).slice(0,4);
    // Only insert the colon once there's a third digit, so backspacing
    // over it doesn't immediately put it back.
    return d.length > 2 ? d.slice(0,2) + ":" + d.slice(2) : d;
  }

  // ---- date: shown as "dd/mm/yyyy", stored as "YYYY-MM-DD" ----
  function normalizeDate(raw){
    var d = digitsOf(raw);
    var dd, mm, yyyy;
    if(d.length === 8){ dd = d.slice(0,2); mm = d.slice(2,4); yyyy = d.slice(4); }
    else if(d.length === 6){ dd = d.slice(0,2); mm = d.slice(2,4); yyyy = "20" + d.slice(4); }
    else if(d.length === 4){ dd = d.slice(0,2); mm = d.slice(2,4); yyyy = String(new Date().getFullYear()); }
    else return null;
    // Round-trip through a real Date so 31/02 and friends are rejected.
    var probe = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if(probe.getFullYear() !== Number(yyyy) ||
       probe.getMonth() !== Number(mm) - 1 ||
       probe.getDate() !== Number(dd)) return null;
    return yyyy + "-" + mm + "-" + dd;
  }
  function maskDate(raw){
    var d = digitsOf(raw).slice(0,8);
    if(d.length > 4) return d.slice(0,2) + "/" + d.slice(2,4) + "/" + d.slice(4);
    if(d.length > 2) return d.slice(0,2) + "/" + d.slice(2);
    return d;
  }
  function displayDate(iso){
    if(!isValidDateStr(iso)) return "";
    var parts = iso.split("-");
    return parts[2] + "/" + parts[1] + "/" + parts[0];
  }

  // ---- field accessors used everywhere else in the app ----
  // getDateField/getTimeField return the stored form ("YYYY-MM-DD" / "HH:MM")
  // or "" when the box is empty, or null when what's typed isn't a real
  // date/time - so callers can tell "nothing entered" from "entered wrong".
  function getDateField(id){
    var el = document.getElementById(id);
    if(!el.value.trim()) return "";
    return normalizeDate(el.value);
  }
  function setDateField(id, iso){
    var el = document.getElementById(id);
    el.value = iso ? displayDate(iso) : "";
    el.classList.remove("invalid");
  }
  function getTimeField(id){
    var el = document.getElementById(id);
    if(!el.value.trim()) return "";
    return normalizeTime(el.value);
  }
  function setTimeField(id, val){
    var el = document.getElementById(id);
    el.value = val || "";
    el.classList.remove("invalid");
  }

  // Mask while typing; tidy up and flag bad input on the way out.
  function wireFormattedField(id, mask, normalize, onSettled){
    var el = document.getElementById(id);
    if(!el) return;
    el.addEventListener("input", function(){
      var masked = mask(el.value);
      if(masked !== el.value) el.value = masked;
      el.classList.remove("invalid");
    });
    el.addEventListener("blur", function(){
      if(!el.value.trim()){ el.classList.remove("invalid"); if(onSettled) onSettled(); return; }
      var normalized = normalize(el.value);
      if(normalized === null){
        el.classList.add("invalid");
      } else {
        el.classList.remove("invalid");
        el.value = (normalize === normalizeDate) ? displayDate(normalized) : normalized;
      }
      if(onSettled) onSettled();
    });
  }

  wireFormattedField("logDate", maskDate, normalizeDate, function(){ renderLog(); });
  wireFormattedField("logEventDate", maskDate, normalizeDate);
  wireFormattedField("logEventStart", maskTime, normalizeTime);
  wireFormattedField("logEventEnd", maskTime, normalizeTime);

  // ================= EVENT CALENDAR (admins only) =================
  // A month-grid view of every logged entry whose item is in the "Event"
  // category. It reads straight from data.entries - there is no separate
  // list of events to keep in sync - so anything logged on the Log Drinks
  // tab appears here immediately, and anything deleted disappears.

  var calState = { year: null, month: null, selected: null };

  function calMonthNames(){ return t("calendar_months").split(","); }
  function calWeekdayNames(){ return t("calendar_weekdays_short").split(","); }

  // "2026-09-04" -> local Date at midnight (never via new Date(str), which
  // parses a bare date as UTC and can shift the day in our timezone).
  function dateFromStr(str){
    var parts = String(str).split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  function dateToStr(d){
    return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
  }
  function isValidDateStr(str){
    return /^\d{4}-\d{2}-\d{2}$/.test(String(str || ""));
  }

  function eventEntries(){
    return data.entries.filter(function(e){
      return e.category === "Event" && isValidDateStr(e.eventDate);
    });
  }
  function eventsOnDate(dateStr){
    return eventEntries()
      .filter(function(e){ return e.eventDate === dateStr; })
      .sort(function(a,b){
        var as = a.eventStart || "99:99", bs = b.eventStart || "99:99";
        if(as !== bs) return as < bs ? -1 : 1;
        return a.ts - b.ts;
      });
  }

  function ensureCalState(){
    if(calState.year === null || calState.month === null){
      var now = new Date();
      calState.year = now.getFullYear();
      calState.month = now.getMonth();
    }
  }

  function renderCalendar(){
    var grid = document.getElementById("calGrid");
    if(!grid) return;               // calendar markup not present
    if(!canManageStaff()) return;   // staff accounts never see this view
    ensureCalState();

    var year = calState.year, month = calState.month;
    var monthNames = calMonthNames();
    document.getElementById("calMonthLabel").textContent =
      (monthNames[month] || (month+1)) + " " + year;

    // In Hebrew the whole toolbar is mirrored, so "previous" sits on the
    // right and needs the arrow that points right (and the reverse in English).
    // These are the solid triangles U+25C0 / U+25B6 on purpose: the angle
    // quotes < and > are bidi-mirrored characters, which the browser flips
    // by itself on a right-to-left page - so flipping them here as well
    // cancelled out and left them pointing the wrong way. Triangles aren't
    // mirrored, so this is the only flip that happens.
    var rtl = document.documentElement.dir === "rtl";
    document.getElementById("btnCalPrev").textContent = rtl ? "\u25B6" : "\u25C0";
    document.getElementById("btnCalNext").textContent = rtl ? "\u25C0" : "\u25B6";

    // Weekday header row (Sunday-first, which is how the week runs here).
    var weekdaysBox = document.getElementById("calWeekdays");
    weekdaysBox.innerHTML = "";
    calWeekdayNames().forEach(function(name){
      var cell = document.createElement("div");
      cell.className = "cal-weekday";
      cell.textContent = name;
      weekdaysBox.appendChild(cell);
    });

    // Count this month's events per day in one pass.
    var monthPrefix = year + "-" + pad(month+1);
    var countByDate = {};
    var monthTotal = 0;
    eventEntries().forEach(function(e){
      if(e.eventDate.slice(0,7) !== monthPrefix) return;
      countByDate[e.eventDate] = (countByDate[e.eventDate] || 0) + 1;
      monthTotal++;
    });
    document.getElementById("calEmptyMonth").style.display = monthTotal ? "none" : "block";

    var firstWeekday = new Date(year, month, 1).getDay();      // 0 = Sunday
    var daysInMonth  = new Date(year, month+1, 0).getDate();
    var todayS = todayStr();

    grid.innerHTML = "";
    for(var i = 0; i < firstWeekday; i++){
      var blank = document.createElement("div");
      blank.className = "cal-day empty";
      grid.appendChild(blank);
    }
    for(var day = 1; day <= daysInMonth; day++){
      (function(day){
        var dateStr = year + "-" + pad(month+1) + "-" + pad(day);
        var count = countByDate[dateStr] || 0;
        var cell = document.createElement("div");
        cell.className = "cal-day" +
          (count ? " has-events" : "") +
          (dateStr === todayS ? " today" : "") +
          (dateStr === calState.selected ? " selected" : "");
        cell.setAttribute("role", "button");
        cell.setAttribute("tabindex", "0");

        var num = document.createElement("div");
        num.className = "cal-day-num";
        num.textContent = day;
        cell.appendChild(num);

        if(count){
          var badge = document.createElement("div");
          badge.className = "cal-day-count";
          badge.textContent = count;
          cell.appendChild(badge);

          // Names of the first couple of events, so the month view is
          // readable at a glance without clicking into each day.
          var names = document.createElement("div");
          names.className = "cal-day-names";
          var dayEvents = eventsOnDate(dateStr);
          dayEvents.slice(0,2).forEach(function(e){
            var line = document.createElement("div");
            line.className = "cal-day-name";
            line.textContent = (e.eventStart ? e.eventStart + " " : "") + e.itemName;
            names.appendChild(line);
          });
          if(dayEvents.length > 2){
            var more = document.createElement("div");
            more.className = "cal-day-name muted";
            more.textContent = "+" + (dayEvents.length - 2);
            names.appendChild(more);
          }
          cell.appendChild(names);
        }

        function selectDay(){
          calState.selected = dateStr;
          renderCalendar();
        }
        cell.addEventListener("click", selectDay);
        cell.addEventListener("keydown", function(ev){
          if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); selectDay(); }
        });
        grid.appendChild(cell);
      })(day);
    }

    renderCalendarDay();
  }

  function renderCalendarDay(){
    var box = document.getElementById("calDayBox");
    var title = document.getElementById("calDayTitle");
    if(!box) return;

    if(!calState.selected){
      title.textContent = t("calendar_day_title");
      box.innerHTML = '<p class="muted">' + escapeHtml(t("calendar_pick_a_day")) + '</p>';
      return;
    }

    title.textContent = t("calendar_day_title_for", {date: displayDate(calState.selected)});
    var dayEvents = eventsOnDate(calState.selected);
    if(dayEvents.length === 0){
      box.innerHTML = '<p class="muted">' + escapeHtml(t("calendar_no_events_day")) + '</p>';
      return;
    }

    box.innerHTML = "";
    var table = document.createElement("table");
    table.innerHTML =
      '<thead><tr>' +
        '<th>' + escapeHtml(t("calendar_th_time")) + '</th>' +
        '<th>' + escapeHtml(t("calendar_th_event")) + '</th>' +
        '<th>' + escapeHtml(t("calendar_th_member")) + '</th>' +
        '<th>' + escapeHtml(t("calendar_th_qty")) + '</th>' +
        '<th>' + escapeHtml(t("calendar_th_total")) + '</th>' +
        '<th>' + escapeHtml(t("calendar_th_logged_by")) + '</th>' +
        '<th></th>' +
      '</tr></thead><tbody></tbody>';
    var tbody = table.querySelector("tbody");

    dayEvents.forEach(function(e){
      var member = data.members.find(function(m){ return m.id === e.memberId; });
      var timeText = timeRangeText(e.eventStart, e.eventEnd, true) || t("calendar_no_time");
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td>' + escapeHtml(timeText) + '</td>' +
        '<td>' + escapeHtml(e.itemName) + escapeHtml(entryExtrasSuffix(e)) + '</td>' +
        '<td>' + escapeHtml(member ? (member.name + " (#" + member.number + ")") : t("removed_member")) + '</td>' +
        '<td>' + e.qty + '</td>' +
        '<td>' + currency() + money(entryLineTotal(e)) + '</td>' +
        '<td>' + escapeHtml(e.loggedBy || "-") + '<br><span class="muted">' +
          escapeHtml(t("calendar_logged_on", {date: displayDate(e.date)})) + '</span></td>' +
        '<td></td>';

      var delBtn = document.createElement("button");
      delBtn.className = "small";
      delBtn.textContent = t("btn_delete");
      delBtn.onclick = function(){
        if(!requireAdmin()) return;
        if(!confirm(t("calendar_delete_confirm"))) return;
        // Events don't hold stock, so nothing is returned to the menu here.
        data.entries = data.entries.filter(function(x){ return x.id !== e.id; });
        save();
        renderCalendar();
        renderLog();
      };
      tr.children[6].appendChild(delBtn);
      tbody.appendChild(tr);
    });

    box.appendChild(table);
  }

  function calShiftMonth(delta){
    ensureCalState();
    var d = new Date(calState.year, calState.month + delta, 1);
    calState.year = d.getFullYear();
    calState.month = d.getMonth();
    renderCalendar();
  }

  (function wireCalendarControls(){
    var prev = document.getElementById("btnCalPrev");
    if(!prev) return;
    prev.addEventListener("click", function(){ calShiftMonth(-1); });
    document.getElementById("btnCalNext").addEventListener("click", function(){ calShiftMonth(1); });
    document.getElementById("btnCalToday").addEventListener("click", function(){
      var now = new Date();
      calState.year = now.getFullYear();
      calState.month = now.getMonth();
      calState.selected = todayStr();
      renderCalendar();
    });
  })();


  // ================= CONFIRM-DELETE DIALOG =================
  // A small in-app dialog instead of confirm(), because deleting a billed
  // entry needs a third answer beyond yes/no: whether the stock it used
  // should go back on the shelf. An old entry usually should NOT - the
  // bottle really was poured back then - so the box starts unticked.

  var pendingDelete = null;   // {entry, onConfirm}

  function closeConfirmDialog(){
    document.getElementById("confirmOverlay").style.display = "none";
    pendingDelete = null;
  }

  // entry: the entry being removed. onConfirm(restoreStock) runs if they go ahead.
  function askDeleteEntry(entry, onConfirm){
    var member = data.members.find(function(m){ return m.id === entry.memberId; });
    var item = data.items.find(function(x){ return x.id === entry.itemId; });
    var stockable = entry.category !== "Event" && !!item;

    document.getElementById("confirmBody").textContent = t("confirm_delete_body", {
      item: entry.itemName + entryExtrasSuffix(entry),
      qty: entry.qty,
      member: member ? member.name : t("removed_member"),
      date: displayDate(entry.date) || entry.date,
      total: currency() + money(entryLineTotal(entry))
    });

    var stockField = document.getElementById("confirmStockField");
    var stockBox = document.getElementById("confirmStockBack");
    stockBox.checked = false;
    stockField.style.display = stockable ? "" : "none";
    if(stockable){
      document.getElementById("confirmStockLabel").textContent =
        t("confirm_delete_stock", {n: entry.qty, item: item.name});
    }

    pendingDelete = { entry: entry, onConfirm: onConfirm };
    document.getElementById("confirmOverlay").style.display = "flex";
    document.getElementById("btnConfirmCancel").focus();
  }

  document.getElementById("btnConfirmCancel").addEventListener("click", closeConfirmDialog);
  document.getElementById("btnConfirmDelete").addEventListener("click", function(){
    if(!pendingDelete) return;
    var job = pendingDelete;
    var restoreStock = document.getElementById("confirmStockBack").checked &&
                       document.getElementById("confirmStockField").style.display !== "none";
    closeConfirmDialog();
    job.onConfirm(restoreStock);
  });
  // Clicking the dark backdrop, or Esc, cancels - never deletes.
  document.getElementById("confirmOverlay").addEventListener("click", function(ev){
    if(ev.target === this) closeConfirmDialog();
  });
  document.addEventListener("keydown", function(ev){
    if(ev.key === "Escape" && pendingDelete) closeConfirmDialog();
  });

  // Removes an entry everywhere it shows up, optionally putting its stock back.
  function deleteEntry(entry, restoreStock){
    if(restoreStock && entry.category !== "Event"){
      var item = data.items.find(function(x){ return x.id === entry.itemId; });
      if(item) item.stock += entry.qty;
    }
    data.entries = data.entries.filter(function(x){ return x.id !== entry.id; });
    save();
  }

  // ================= REPORTS =================
  function monthEntries(monthStr){
    return data.entries.filter(function(e){ return e.date && e.date.slice(0,7)===monthStr; });
  }

  function buildSummary(monthStr){
    var entries = monthEntries(monthStr);
    var byMember = {};
    entries.forEach(function(e){
      if(!byMember[e.memberId]) byMember[e.memberId] = {items:0, total:0};
      byMember[e.memberId].items += e.qty;
      byMember[e.memberId].total += entryLineTotal(e);
    });
    var rows = Object.keys(byMember).map(function(mid){
      var member = data.members.find(function(m){return m.id===mid;});
      return {
        memberId: mid,
        number: member ? member.number : "",
        name: member ? member.name : t("removed_member"),
        items: byMember[mid].items,
        total: byMember[mid].total
      };
    });
    rows.sort(function(a,b){return (a.number||"").localeCompare(b.number||"", undefined, {numeric:true});});
    return rows;
  }

  function renderReport(){
    var monthStr = document.getElementById("reportMonth").value;
    var tbody = document.querySelector("#reportTable tbody");
    tbody.innerHTML = "";
    if(!monthStr){ return; }
    var rows = buildSummary(monthStr);
    var grand = 0;
    rows.forEach(function(r){ grand += r.total; });
    document.getElementById("reportGrandTotal").textContent = currency() + money(grand);

    var reportQuery = document.getElementById("searchReport").value;
    var visibleRows = rows.filter(function(r){ return matchesQuery(r.number + " " + r.name, reportQuery); });

    visibleRows.forEach(function(r){
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td>'+escapeHtml(r.number)+'</td>'+
        '<td>'+escapeHtml(r.name)+'</td>'+
        '<td>'+r.items+'</td>'+
        '<td>'+currency()+money(r.total)+'</td>'+
        '<td><button class="small" data-mid="'+r.memberId+'">'+t("btn_details")+'</button></td>';
      tbody.appendChild(tr);
    });
    if(visibleRows.length===0){
      tbody.innerHTML = '<tr><td colspan="5" class="muted">'+t(rows.length===0 ? "no_entries_month" : "no_matching_members")+'</td></tr>';
    }
    document.getElementById("reportDetailBox").innerHTML = "";
    openDetail = null;

    tbody.querySelectorAll("button[data-mid]").forEach(function(btn){
      btn.addEventListener("click", function(){
        showMemberDetail(monthStr, btn.dataset.mid);
      });
    });
  }

  document.getElementById("searchReport").addEventListener("input", renderReport);

  // Remembers which member's breakdown is open, so the panel can be rebuilt
  // in place after a deletion instead of collapsing back to the summary.
  var openDetail = null;   // {monthStr, memberId}

  function showMemberDetail(monthStr, memberId){
    openDetail = { monthStr: monthStr, memberId: memberId };
    var entries = monthEntries(monthStr).filter(function(e){return e.memberId===memberId;})
      .sort(function(a,b){return a.ts-b.ts;});
    var member = data.members.find(function(m){return m.id===memberId;});
    var box = document.getElementById("reportDetailBox");
    var label = member ? (member.number + " - " + member.name) : t("removed_member");
    // Removing a line changes a bill the accountant may already have, so
    // only admins get the delete column - staff still fix same-day
    // mistakes on the Log Drinks tab.
    var canDelete = canManageStaff();

    var html = '<h3 style="margin-top:20px;">'+escapeHtml(label)+t("detail_heading_suffix")+'</h3>';
    html += '<table><thead><tr><th>'+t("th_date")+'</th><th>'+t("th_item")+'</th><th>'+t("th_qty")+'</th><th>'+t("th_unit_price")+'</th><th>'+t("th_line_total")+'</th><th>'+t("th_logged_by")+'</th>'+(canDelete ? '<th></th>' : '')+'</tr></thead><tbody>';
    entries.forEach(function(e){
      html += '<tr><td>'+displayDate(e.date)+'</td><td>'+escapeHtml(e.itemName)+escapeHtml(entryExtrasSuffix(e))+escapeHtml(entryEventSuffix(e))+'</td><td>'+e.qty+'</td><td>'+currency()+money(e.unitPrice)+'</td><td>'+currency()+money(entryLineTotal(e))+'</td><td>'+escapeHtml(e.loggedBy||"-")+'</td>'+
        (canDelete ? '<td><button class="small" data-entry-id="'+escapeHtml(e.id)+'">'+escapeHtml(t("btn_delete"))+'</button></td>' : '')+'</tr>';
    });
    html += '</tbody></table>';
    if(entries.length === 0){
      html += '<p class="muted">'+escapeHtml(t("no_entries_month"))+'</p>';
    }
    box.innerHTML = html;

    if(!canDelete) return;
    box.querySelectorAll("button[data-entry-id]").forEach(function(btn){
      btn.addEventListener("click", function(){
        if(!requireAdmin()) return;
        var entry = data.entries.find(function(x){ return x.id === btn.dataset.entryId; });
        if(!entry) return;
        askDeleteEntry(entry, function(restoreStock){
          deleteEntry(entry, restoreStock);
          // Refresh everywhere this entry could have been showing.
          renderReport();
          showMemberDetail(monthStr, memberId);
          renderLog();
          renderMenu();
          renderCalendar();
        });
      });
    });
  }

  document.getElementById("btnShowReport").addEventListener("click", renderReport);

  document.getElementById("btnExportSummary").addEventListener("click", function(){
    var monthStr = document.getElementById("reportMonth").value;
    if(!monthStr){ alert(t("alert_pick_date")); return; }
    var rows = buildSummary(monthStr);
    var out = [];
    out.push([t("csv_summary_title", {month: monthStr})]);
    out.push([]);
    out.push([t("th_member_num"), t("th_member"), t("th_items"), t("csv_total_due_currency", {currency: currency()})]);
    var grand = 0;
    rows.forEach(function(r){
      grand += r.total;
      out.push([r.number, r.name, r.items, money(r.total)]);
    });
    out.push([]);
    out.push(["", t("csv_grand_total"), "", money(grand)]);
    downloadCsv("stable-pub-summary-" + monthStr + ".csv", out);
  });

  document.getElementById("btnExportDetailed").addEventListener("click", function(){
    var monthStr = document.getElementById("reportMonth").value;
    if(!monthStr){ alert(t("alert_pick_date")); return; }
    var entries = monthEntries(monthStr).slice().sort(function(a,b){
      if(a.date!==b.date) return a.date.localeCompare(b.date);
      return a.ts-b.ts;
    });
    var out = [];
    out.push([t("csv_detail_title", {month: monthStr})]);
    out.push([]);
    out.push([t("th_date"), t("th_member_num"), t("th_member"), t("th_item"), t("th_category"), t("th_qty"), t("th_unit_price"), t("th_line_total"), t("th_logged_by")]);
    entries.forEach(function(e){
      var member = data.members.find(function(m){return m.id===e.memberId;});
      out.push([e.date, member?member.number:"", member?member.name:t("removed_member"), e.itemName + entryExtrasSuffix(e) + entryEventSuffix(e, false), e.category, e.qty, money(e.unitPrice), money(entryLineTotal(e)), e.loggedBy||""]);
    });
    downloadCsv("stable-pub-detailed-" + monthStr + ".csv", out);
  });

  // ================= BACKUP =================
  var BACKUP_REMINDER_DAYS = 30;

  function daysSince(dateStr){
    if(!dateStr) return Infinity;
    var then = new Date(dateStr + "T00:00:00");
    var now = new Date(todayStr() + "T00:00:00");
    return Math.round((now - then) / 86400000);
  }

  function doBackup(){
    var stamp = todayStr();
    downloadJson("stable-pub-backup-" + stamp + ".json", data);
    data.settings.lastBackupDate = stamp;
    save();
    renderBackupStatus();
  }

  function renderBackupStatus(){
    var last = data.settings.lastBackupDate;
    var days = daysSince(last);
    var reminder = document.getElementById("backupReminder");
    var reminderText = document.getElementById("backupReminderText");
    var infoLine = document.getElementById("lastBackupInfo");

    if(!last){
      infoLine.textContent = t("backup_never");
    } else {
      infoLine.textContent = t("backup_last", {date:last, n:days});
    }

    if(days >= BACKUP_REMINDER_DAYS && canManageStaff()){
      reminder.style.display = "block";
      reminderText.textContent = !last ? t("backup_reminder_never") : t("backup_reminder_overdue", {n:days});
    } else {
      reminder.style.display = "none";
    }
  }

  document.getElementById("btnBackup").addEventListener("click", doBackup);
  document.getElementById("btnBackupFromReminder").addEventListener("click", doBackup);

  // ================= KITCHEN PRINTER =================
  function renderPrinterSettings(){
    document.getElementById("printFoodToggle").checked = !!data.settings.printFood;
    document.getElementById("printDrinksToggle").checked = !!data.settings.printDrinks;
    document.getElementById("printerTarget").value = data.settings.printerTarget || "";
  }

  document.getElementById("btnSavePrinterSettings").addEventListener("click", function(){
    data.settings.printFood = document.getElementById("printFoodToggle").checked;
    data.settings.printDrinks = document.getElementById("printDrinksToggle").checked;
    data.settings.printerTarget = document.getElementById("printerTarget").value.trim();
    save();
    var status = document.getElementById("printerSettingsStatus");
    status.textContent = t("printer_settings_saved");
    setTimeout(function(){ status.textContent = ""; }, 2500);
  });

  function sendKitchenTicket(payload){
    return fetch("/api/print-ticket", {
      method: "POST",
      headers: {"Content-Type": "application/json; charset=utf-8"},
      body: JSON.stringify(payload)
    }).then(function(res){ return res.json(); });
  }

  function ticketPayloadFromEntry(e){
    var member = data.members.find(function(m){return m.id===e.memberId;});
    return {
      printerTarget: data.settings.printerTarget || "",
      category: e.category,
      itemName: e.itemName,
      extras: (e.extras||[]).map(function(x){return x.name;}),
      qty: e.qty,
      memberLabel: member ? (member.number + " - " + member.name) : "",
      time: new Date(e.ts).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})
    };
  }

  document.getElementById("btnTestPrint").addEventListener("click", function(){
    var target = document.getElementById("printerTarget").value.trim();
    var status = document.getElementById("printerSettingsStatus");
    if(!target){ alert(t("alert_enter_printer_target")); return; }
    status.textContent = t("printer_testing");
    sendKitchenTicket({
      printerTarget: target,
      category: "Food",
      itemName: t("printer_test_item"),
      extras: [],
      qty: 1,
      memberLabel: "",
      time: new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})
    }).then(function(resJson){
      status.textContent = (resJson && resJson.ok) ? t("printer_test_success") : (t("printer_test_failed") + (resJson && resJson.error ? " " + resJson.error : ""));
    }).catch(function(){
      status.textContent = t("printer_test_failed");
    });
  });

  document.getElementById("btnRestore").addEventListener("click", function(){
    var fileInput = document.getElementById("restoreFile");
    var file = fileInput.files[0];
    if(!file){ alert(t("alert_choose_backup_file")); return; }
    var reader = new FileReader();
    reader.onload = function(e){
      try{
        var parsed = JSON.parse(e.target.result);
        if(!parsed.members || !parsed.items || !parsed.entries){
          alert(t("alert_invalid_backup"));
          return;
        }
        if(confirm(t("confirm_restore"))){
          data = parsed;
          if(!data.settings) data.settings = { currency: "₪" };
          if(data.settings.printFood===undefined) data.settings.printFood = false;
          if(data.settings.printDrinks===undefined) data.settings.printDrinks = false;
          if(data.settings.printerTarget===undefined) data.settings.printerTarget = "";
          if(!data.users) data.users = [];
          if(!data.items) data.items = [];
          data.items.forEach(function(it){ if(it.extras===undefined) it.extras = []; });
          data.users.forEach(function(u){ if(u.role===undefined) u.role = "staff"; });
          var restoredHasActiveAdmin = data.users.some(function(u){ return u.role==="admin" && u.active; });
          if(!restoredHasActiveAdmin && data.users.length > 0){
            var restoredCandidate = data.users.find(function(u){ return u.active; }) || data.users[0];
            restoredCandidate.role = "admin";
          }
          sessionStorage.removeItem(SESSION_KEY);
          save();
          renderMembers(); renderMenu(); renderLog();
          renderBackupStatus(); renderStaff(); renderCalendar();
          document.getElementById("reportTable").querySelector("tbody").innerHTML = "";
          alert(t("alert_backup_restored"));
          showLoginGateIfNeeded();
        }
      }catch(err){
        alert(t("alert_restore_read_error", {msg: err.message}));
      }
    };
    reader.readAsText(file, "UTF-8");
  });

  // ================= INIT =================
  setDateField("logDate", todayStr());
  var monthInput = document.getElementById("reportMonth");
  var now = new Date();
  monthInput.value = now.getFullYear() + "-" + pad(now.getMonth()+1);

  applyLanguage();
  showLoginGateIfNeeded();
})();
