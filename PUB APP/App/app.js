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
    renderStaff();
    updateUserBadge();
    if(document.getElementById("reportMonth").value){
      renderReport();
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
  function updateStaffNavVisibility(){
    var staffNavBtn = document.querySelector('nav button[data-view="staff"]');
    var allowed = canManageStaff();
    if(staffNavBtn) staffNavBtn.style.display = allowed ? "" : "none";
    if(!allowed){
      var staffSection = document.getElementById("view-staff");
      if(staffSection && staffSection.classList.contains("active")){
        document.querySelectorAll("section.view").forEach(function(s){ s.classList.remove("active"); });
        document.querySelectorAll("nav button").forEach(function(b){ b.classList.remove("active"); });
        document.getElementById("view-log").classList.add("active");
        var logNavBtn = document.querySelector('nav button[data-view="log"]');
        if(logNavBtn) logNavBtn.classList.add("active");
      }
    }
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
    return { members: [], items: [], entries: [], users: [], settings: { currency: "₪" } };
  }

  function load(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return defaultData();
      var parsed = JSON.parse(raw);
      if(!parsed.settings) parsed.settings = { currency: "₪" };
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
      navButtons.forEach(function(b){ b.classList.remove("active"); });
      btn.classList.add("active");
      document.querySelectorAll("section.view").forEach(function(s){ s.classList.remove("active"); });
      document.getElementById("view-" + btn.dataset.view).classList.add("active");
      if(btn.dataset.view === "members") renderMembers();
      if(btn.dataset.view === "menu") renderMenu();
      if(btn.dataset.view === "log") renderLog();
      if(btn.dataset.view === "backup") renderBackupStatus();
      if(btn.dataset.view === "staff") renderStaff();
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
    ["Drink","Food","Other"].forEach(function(cat){
      var group = data.items.filter(function(it){return it.active && it.category===cat && matchesQuery(it.name, itemQuery);});
      if(group.length===0) return;
      anyItems = true;
      var optgroup = document.createElement("optgroup");
      var catKey = cat==="Drink" ? "opt_drink" : (cat==="Food" ? "opt_food" : "opt_other");
      optgroup.label = t(catKey);
      group.sort(function(a,b){return a.name.localeCompare(b.name);}).forEach(function(it){
        var opt = document.createElement("option");
        opt.value = it.id;
        var stockLabel = it.stock<=0 ? t("out_of_stock_suffix") : t("stock_suffix", {n: it.stock});
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

  document.getElementById("searchMember").addEventListener("input", fillLogDropdowns);
  document.getElementById("searchItem").addEventListener("input", fillLogDropdowns);
  document.getElementById("logItem").addEventListener("change", function(){
    updateLogItemPreview();
    updateLogItemExtras();
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
    if(!dateInput.value) dateInput.value = todayStr();
    var selDate = dateInput.value;

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
          '<td>'+escapeHtml(e.itemName)+escapeHtml(entryExtrasSuffix(e))+'</td>'+
          '<td>'+e.qty+'</td>'+
          '<td>'+currency()+money(e.unitPrice)+'</td>'+
          '<td>'+currency()+money(lineTotal)+'</td>'+
          '<td>'+escapeHtml(e.loggedBy||"-")+'</td>'+
          '<td></td>';
        var delBtn = document.createElement("button");
        delBtn.className="small"; delBtn.textContent=t("btn_delete");
        delBtn.onclick = function(){
          if(confirm(t("confirm_remove_entry"))){
            var relatedItem = data.items.find(function(x){return x.id===e.itemId;});
            if(relatedItem) relatedItem.stock += e.qty;
            data.entries = data.entries.filter(function(x){return x.id!==e.id;});
            save(); renderLog();
          }
        };
        tr.children[8].appendChild(delBtn);
        tbody.appendChild(tr);
      });
    document.getElementById("logDayTotal").textContent = currency() + money(dayTotal);
  }

  document.getElementById("logDate").addEventListener("change", renderLog);

  document.getElementById("btnAddEntry").addEventListener("click", function(){
    var date = document.getElementById("logDate").value;
    var memberId = document.getElementById("logMember").value;
    var itemId = document.getElementById("logItem").value;
    var qty = parseInt(document.getElementById("logQty").value, 10);
    if(!date){ alert(t("alert_pick_date")); return; }
    if(!memberId){ alert(t("alert_select_member")); return; }
    if(!itemId){ alert(t("alert_select_item")); return; }
    if(isNaN(qty) || qty<1){ alert(t("alert_enter_valid_qty")); return; }
    var item = data.items.find(function(it){return it.id===itemId;});
    if(item.stock - qty < 0){
      var proceed = confirm(t("confirm_low_stock", {n:item.stock, item:item.name}));
      if(!proceed) return;
    }
    item.stock -= qty;
    var loggedInUser = getCurrentUser();
    var chosenExtras = [];
    document.querySelectorAll("#logExtrasBox input[type=checkbox]:checked").forEach(function(cb){
      var ex = (item.extras||[]).find(function(x){return x.id===cb.value;});
      if(ex) chosenExtras.push({name: ex.name, price: ex.price});
    });
    data.entries.push({
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
    });
    save();
    document.getElementById("logQty").value = "1";
    renderLog();
    renderMenu();
  });

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

    tbody.querySelectorAll("button[data-mid]").forEach(function(btn){
      btn.addEventListener("click", function(){
        showMemberDetail(monthStr, btn.dataset.mid);
      });
    });
  }

  document.getElementById("searchReport").addEventListener("input", renderReport);

  function showMemberDetail(monthStr, memberId){
    var entries = monthEntries(monthStr).filter(function(e){return e.memberId===memberId;})
      .sort(function(a,b){return a.ts-b.ts;});
    var member = data.members.find(function(m){return m.id===memberId;});
    var box = document.getElementById("reportDetailBox");
    var label = member ? (member.number + " - " + member.name) : t("removed_member");
    var html = '<h3 style="margin-top:20px;">'+escapeHtml(label)+t("detail_heading_suffix")+'</h3>';
    html += '<table><thead><tr><th>'+t("th_date")+'</th><th>'+t("th_item")+'</th><th>'+t("th_qty")+'</th><th>'+t("th_unit_price")+'</th><th>'+t("th_line_total")+'</th><th>'+t("th_logged_by")+'</th></tr></thead><tbody>';
    entries.forEach(function(e){
      html += '<tr><td>'+e.date+'</td><td>'+escapeHtml(e.itemName)+escapeHtml(entryExtrasSuffix(e))+'</td><td>'+e.qty+'</td><td>'+currency()+money(e.unitPrice)+'</td><td>'+currency()+money(entryLineTotal(e))+'</td><td>'+escapeHtml(e.loggedBy||"-")+'</td></tr>';
    });
    html += '</tbody></table>';
    box.innerHTML = html;
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
      out.push([e.date, member?member.number:"", member?member.name:t("removed_member"), e.itemName + entryExtrasSuffix(e), e.category, e.qty, money(e.unitPrice), money(entryLineTotal(e)), e.loggedBy||""]);
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

    if(days >= BACKUP_REMINDER_DAYS){
      reminder.style.display = "block";
      reminderText.textContent = !last ? t("backup_reminder_never") : t("backup_reminder_overdue", {n:days});
    } else {
      reminder.style.display = "none";
    }
  }

  document.getElementById("btnBackup").addEventListener("click", doBackup);
  document.getElementById("btnBackupFromReminder").addEventListener("click", doBackup);

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
          renderBackupStatus(); renderStaff();
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
  document.getElementById("logDate").value = todayStr();
  var monthInput = document.getElementById("reportMonth");
  var now = new Date();
  monthInput.value = now.getFullYear() + "-" + pad(now.getMonth()+1);

  applyLanguage();
  showLoginGateIfNeeded();
})();
