
    // --- APP STATE ---
    let DB_TEACHERS = {};
    let DB_STUDENTS = {};
    const FALLBACK_TEACHERS = {
       "Giovanni": ["1A", "1B", "1C", "1D", "1E", "2A", "2B", "2C", "2D", "2E", "3A", "3B", "3C", "3D", "3E", "4A", "4B", "4C", "4D", "4E", "5A", "5B", "5C", "5D", "5E", "6A", "6B", "6C", "6D", "6E"],
       "Ivana": ["1A", "1B", "1C", "1D", "1E", "2A", "2B", "2C", "2D", "2E", "3A", "3B", "3C", "3D", "3E", "4A", "4B", "4C", "4D", "4E", "5A", "5B", "5C", "5D", "5E", "6A", "6B", "6C", "6D", "6E"],
       "Imelda": ["1A", "1B", "1C", "1D", "1E", "2A", "2B", "2C", "2D", "2E", "3A", "3B", "3C", "3D", "3E", "4A", "4B", "4C", "4D", "4E", "5A", "5B", "5C", "5D", "5E", "6A", "6B", "6C", "6D", "6E"],
       "Shinta": ["1A", "1B", "1C", "1D", "1E", "2A", "2B", "2C", "2D", "2E", "3A", "3B", "3C", "3D", "3E", "4A", "4B", "4C", "4D", "4E", "5A", "5B", "5C", "5D", "5E", "6A", "6B", "6C", "6D", "6E"],
       "Juminah": ["1A", "1B", "1C", "1D", "1E", "2A", "2B", "2C", "2D", "2E", "3A", "3B", "3C", "3D", "3E", "4A", "4B", "4C", "4D", "4E", "5A", "5B", "5C", "5D", "5E", "6A", "6B", "6C", "6D", "6E"]
    };
    
    function getGASUrl() {
       return localStorage.getItem('customGASUrl') || APP_CONFIG.GOOGLE_APPS_SCRIPT_URL;
    }
    
    function showLoading(text) {
       document.getElementById('loading-text').textContent = text;
       document.getElementById('loading-overlay').style.display = 'flex';
    }
    function hideLoading() {
       document.getElementById('loading-overlay').style.display = 'none';
    }
    
    function showTutorial() {
       alert("TUTORIAL MENGUBAH DATABASE:\n\n1. Buka file Google Sheet Brush Master Anda, lalu klik File -> Make a Copy (Buat Salinan).\n2. Di Sheet salinan tersebut, klik Extensions (Ekstensi) -> Apps Script.\n3. Di halaman Apps Script, klik tombol biru 'Deploy' di kanan atas -> 'New Deployment'.\n4. Pilih tipe 'Web App'. Ubah 'Who has access' menjadi 'Anyone' (Siapa saja).\n5. Klik Deploy dan berikan otorisasi Google jika diminta.\n6. Copy URL yang muncul (berakhiran /exec).\n7. Paste URL tersebut di Textbox Pengaturan Server ini dan klik Simpan.\n\nSelamat! Sekarang Anda memiliki database mandiri.");
    }

    // --- NAVIGATION ---
    function showView(viewId) {
       document.getElementById('view-dashboard').style.display = 'none';
       document.getElementById('view-history').style.display = 'none';
       document.getElementById('view-task-details').style.display = 'none';
       document.getElementById('view-options').style.display = 'none';
       document.getElementById(viewId).style.display = 'block';
    }
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
       btn.addEventListener('click', (e) => {
          document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          const id = e.target.id;
          if(id === 'nav-dashboard') showView('view-dashboard');
          if(id === 'nav-history') {
             showView('view-history');
             fetchTasks();
          }
          if(id === 'nav-options') {
             showView('view-options');
             document.getElementById('custom-gas-url').value = getGASUrl();
             try {
                renderTeachersOptions();
             } catch(e) {
                console.error("Error rendering teachers options:", e);
             }
          }
       });
    });

    // --- INIT ---
    window.onload = async () => {
       showLoading("Sinkronisasi Database...");
       try {
          const resT = await fetch(`${getGASUrl()}?action=getTeachers`);
          const dataT = await resT.json();
          if(dataT.status === 'success') {
             try { DB_TEACHERS = JSON.parse(dataT.data); } catch(e) {}
          }
          // Validation: must be object, not array, and have keys. Values must be arrays.
          let isValid = false;
          if (DB_TEACHERS && typeof DB_TEACHERS === 'object' && !Array.isArray(DB_TEACHERS)) {
             const keys = Object.keys(DB_TEACHERS);
             if (keys.length > 0) {
                 isValid = true;
                 for (const k of keys) {
                     if (!Array.isArray(DB_TEACHERS[k])) {
                         isValid = false; break;
                     }
                 }
             }
          }
          if (!isValid) {
             DB_TEACHERS = JSON.parse(JSON.stringify(FALLBACK_TEACHERS));
          }
          
          const resS = await fetch(`${getGASUrl()}?action=getStudents`);
          const dataS = await resS.json();
          if(dataS.status === 'success') {
             try { DB_STUDENTS = JSON.parse(dataS.data); } catch(e) {}
          }
          
          initDashboard();
       } catch (err) {
          console.error(err);
          alert("Gagal terhubung ke Server. Pastikan URL benar di Options.");
          DB_TEACHERS = FALLBACK_TEACHERS;
          initDashboard();
       }
       hideLoading();
    };

    // --- DASHBOARD LOGIC ---
    let selectedVocabs = {};
    let currentTeacher = "";
    
    const generateBtn = document.getElementById('generate-btn');
    const resultBox = document.getElementById('result-box');
    const linkOutput = document.getElementById('link-output');
    const copyBtn = document.getElementById('copy-btn');
    
    function initDashboard() {
       const ts = document.getElementById('teacher-name');
       ts.innerHTML = '<option value="">Pilih Guru...</option>';
       for(const t in DB_TEACHERS) {
          const opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t;
          ts.appendChild(opt);
       }
       renderBookMatrix();
    }
    
    document.getElementById('teacher-name').addEventListener('change', (e) => {
       currentTeacher = e.target.value;
       const cs = document.getElementById('class-select');
       cs.innerHTML = '<option value="">Pilih Kelas...</option>';
       if(!currentTeacher) {
          cs.disabled = true;
          document.getElementById('vocab-card').style.display = 'none';
          updateGenerateBtn();
          return;
       }
       cs.disabled = false;
       const classes = DB_TEACHERS[currentTeacher] || [];
       classes.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.trim();
          opt.textContent = c.trim();
          cs.appendChild(opt);
       });
       document.getElementById('vocab-card').style.display = 'block';
       updateGenerateBtn();
    });
    
    document.getElementById('class-select').addEventListener('change', updateGenerateBtn);
    
    // Matrix Renderers
    function renderBookMatrix() {
       const container = document.getElementById('book-matrix');
       container.innerHTML = '';
       let books = Object.keys(_meihuaDB);
       books.sort((a,b) => parseInt(a.replace('Buku ','')) - parseInt(b.replace('Buku ','')));
       
       let chunked = [];
       for (let i = 0; i < books.length; i += 6) {
           chunked.push(books.slice(i, i + 6));
       }
       
       chunked.forEach((rowBooks) => {
           const row = document.createElement('div');
           row.className = 'matrix-row';
           row.innerHTML = `<div class="matrix-row-label">Meihua</div>`;
           
           rowBooks.forEach(b => {
              const btn = document.createElement('button');
              btn.className = 'matrix-btn book-btn';
              btn.textContent = b;
              btn.onclick = () => {
                 document.querySelectorAll('.book-btn').forEach(el => el.classList.remove('active'));
                 btn.classList.add('active');
                 renderUnitMatrix(b);
              };
              if (selectedVocabs[b] && Object.keys(selectedVocabs[b]).length > 0) {
                 btn.classList.add('has-selection');
              }
              row.appendChild(btn);
           });
           container.appendChild(row);
       });
    }
    
    let currentBook = '';
    function renderUnitMatrix(book) {
       currentBook = book;
       document.getElementById('unit-container').style.display = 'block';
       document.getElementById('vocab-selection-container').style.display = 'none';
       
       const container = document.getElementById('unit-matrix');
       container.innerHTML = '';
       let units = Object.keys(_meihuaDB[book]);
       units.sort((a,b) => parseInt(a.replace('Bab ','')) - parseInt(b.replace('Bab ','')));
       
       const row = document.createElement('div');
       row.className = 'matrix-row';
       row.innerHTML = `<div class="matrix-row-label">Pilih Bab</div>`;
       
       units.forEach(u => {
          const btn = document.createElement('button');
          btn.className = 'matrix-btn unit-btn';
          btn.textContent = u;
          btn.onclick = () => {
             document.querySelectorAll('.unit-btn').forEach(el => el.classList.remove('active'));
             btn.classList.add('active');
             renderVocabSelection(book, u);
          };
          if (selectedVocabs[book] && selectedVocabs[book][u] && Object.keys(selectedVocabs[book][u]).length > 0) {
             btn.classList.add('has-selection');
          }
          row.appendChild(btn);
       });
       container.appendChild(row);
    }
    
    let currentUnit = '';
    function renderVocabSelection(book, unit) {
       currentUnit = unit;
       document.getElementById('vocab-selection-container').style.display = 'block';
       document.getElementById('current-unit-label').textContent = `${book} - ${unit}`;
       
       const list = document.getElementById('vocab-list');
       list.innerHTML = '';
       
       const vocabs = _meihuaDB[book][unit].vocab;
       
       if (!selectedVocabs[book]) selectedVocabs[book] = {};
       if (!selectedVocabs[book][unit]) selectedVocabs[book][unit] = {};
       
       vocabs.forEach((v, index) => {
          const item = document.createElement('div');
          item.className = 'vocab-item';
          if (selectedVocabs[book][unit][index]) item.classList.add('selected');
          
          let content = `<div style="flex-grow:1;">
             <div class="vocab-char">${v.char}</div>
             <div class="vocab-pinyin">${v.pinyin}</div>
             <div class="vocab-pinyin">${v.id || v.en}</div>
          </div>`;
          
          item.innerHTML = content;
          
          const checkboxLabel = document.createElement('label');
          checkboxLabel.style.marginBottom = 0;
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = !!selectedVocabs[book][unit][index];
          
          checkbox.onclick = (e) => {
             e.stopPropagation();
             toggleVocab(book, unit, index);
             if (checkbox.checked) item.classList.add('selected');
             else item.classList.remove('selected');
          };
          
          const charSplitContainer = document.createElement('div');
          charSplitContainer.className = 'char-split-container';
          
          if (v.char.length > 1) {
             const splitBtn = document.createElement('button');
             splitBtn.className = 'vocab-split-btn';
             splitBtn.textContent = 'Pecah Huruf';
             splitBtn.onclick = (e) => {
                 e.stopPropagation();
                 charSplitContainer.style.display = charSplitContainer.style.display === 'flex' ? 'none' : 'flex';
             };
             item.appendChild(splitBtn);
             
             let selChars = selectedVocabs[book][unit][index] || [];
             for(let i=0; i<v.char.length; i++) {
                 const chLabel = document.createElement('label');
                 chLabel.className = 'char-checkbox-item';
                 const chBox = document.createElement('input');
                 chBox.type = 'checkbox';
                 chBox.checked = selChars.includes(i);
                 chBox.onclick = (e) => {
                    e.stopPropagation();
                    let sc = selectedVocabs[book][unit][index] || [];
                    if (chBox.checked) {
                       if(!sc.includes(i)) sc.push(i);
                    } else {
                       sc = sc.filter(x => x !== i);
                    }
                    if (sc.length > 0) {
                       selectedVocabs[book][unit][index] = sc;
                       item.classList.add('selected');
                       checkbox.checked = true;
                    } else {
                       delete selectedVocabs[book][unit][index];
                       item.classList.remove('selected');
                       checkbox.checked = false;
                    }
                    updateCombinedView();
                 };
                 chLabel.appendChild(chBox);
                 chLabel.appendChild(document.createTextNode(v.char[i]));
                 charSplitContainer.appendChild(chLabel);
             }
          }
          
          checkboxLabel.appendChild(checkbox);
          item.insertBefore(checkboxLabel, item.firstChild);
          
          item.onclick = () => checkbox.click();
          
          const wrapper = document.createElement('div');
          wrapper.appendChild(item);
          wrapper.appendChild(charSplitContainer);
          
          list.appendChild(wrapper);
       });
       updateCombinedView();
    }
    
    function toggleVocab(book, unit, index) {
       const v = _meihuaDB[book][unit].vocab[index];
       if (selectedVocabs[book][unit][index]) {
          delete selectedVocabs[book][unit][index];
       } else {
          selectedVocabs[book][unit][index] = Array.from({length: v.char.length}, (_, i) => i);
       }
       updateCombinedView();
    }
    
    document.getElementById('select-all-btn').onclick = () => {
       if(!currentBook || !currentUnit) return;
       const vocabs = _meihuaDB[currentBook][currentUnit].vocab;
       vocabs.forEach((v, index) => {
          selectedVocabs[currentBook][currentUnit][index] = Array.from({length: v.char.length}, (_, i) => i);
       });
       renderVocabSelection(currentBook, currentUnit);
    };
    
    document.getElementById('deselect-all-btn').onclick = () => {
       if(!currentBook || !currentUnit) return;
       delete selectedVocabs[currentBook][currentUnit];
       renderVocabSelection(currentBook, currentUnit);
    };
    
    function updateCombinedView() {
       const cList = document.getElementById('combined-vocab-list');
       cList.innerHTML = '';
       let count = 0;
       
       for (const b in selectedVocabs) {
          for (const u in selectedVocabs[b]) {
             for (const idx in selectedVocabs[b][u]) {
                const chars = selectedVocabs[b][u][idx];
                if (chars.length > 0) {
                   count++;
                   const v = _meihuaDB[b][u].vocab[idx];
                   const el = document.createElement('div');
                   el.className = 'vocab-item';
                   el.style.borderColor = 'var(--primary)';
                   el.style.position = 'relative';
                   el.title = 'Klik untuk menghapus';
                   el.innerHTML = `
                      <div style="flex-grow:1;">
                         <div class="vocab-char">${chars.map(i => v.char[i]).join('')}</div>
                         <div class="vocab-pinyin">${v.pinyin}</div>
                      </div>
                      <div style="font-size:0.7rem; color:#888; text-align:right;">${b}<br>${u}</div>
                      <div style="position:absolute; top:-8px; right:-8px; background:red; color:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold; cursor:pointer;">×</div>
                   `;
                   
                   el.addEventListener('click', () => {
                       delete selectedVocabs[b][u][idx];
                       if (Object.keys(selectedVocabs[b][u]).length === 0) delete selectedVocabs[b][u];
                       if (Object.keys(selectedVocabs[b]).length === 0) delete selectedVocabs[b];
                       
                       updateCombinedView();
                       // Update main vocab list visually if it's the currently open unit
                       if (typeof currentBook !== 'undefined' && currentBook === b && currentUnit === u) {
                           renderVocabs();
                       }
                   });
                   
                   cList.appendChild(el);
                }
             }
          }
       }
       
       document.getElementById('combined-vocab-container').style.display = count > 0 ? 'block' : 'none';
       updateGenerateBtn();
       renderBookMatrix(); // update markers
       
       // Update unit markers if visible
       if(currentBook) {
          document.querySelectorAll('.unit-btn').forEach(btn => {
             const u = btn.textContent;
             if(selectedVocabs[currentBook] && selectedVocabs[currentBook][u] && Object.keys(selectedVocabs[currentBook][u]).length > 0) {
                btn.classList.add('has-selection');
             } else {
                btn.classList.remove('has-selection');
             }
          });
       }
    }
    
    function updateGenerateBtn() {
       const cls = document.getElementById('class-select').value;
       let hasVocab = false;
       for (const b in selectedVocabs) {
          for (const u in selectedVocabs[b]) {
             if (Object.keys(selectedVocabs[b][u]).length > 0) { hasVocab = true; break; }
          }
          if (hasVocab) break;
       }
       generateBtn.disabled = !(currentTeacher && cls && hasVocab);
    }
    
    generateBtn.addEventListener('click', () => {
      const cls = document.getElementById('class-select').value;
      const rep = document.getElementById('repetition').value;
      const requireMeaning = document.getElementById('require-meaning').checked;
      
      let vObj = {};
      for (const b in selectedVocabs) {
          for (const u in selectedVocabs[b]) {
             const keys = Object.keys(selectedVocabs[b][u]);
             if(keys.length > 0) {
                if(!vObj[b]) vObj[b] = {};
                const parts = [];
                for (const idx of keys) {
                   parts.push(`${idx}:${selectedVocabs[b][u][idx].join(',')}`);
                }
                vObj[b][u] = parts.join('|');
             }
          }
      }
      
      const payload = { cls: cls, r: rep, v: vObj, tm: requireMeaning ? 1 : 0, guru: document.getElementById('teacher-name').value };
      const payloadString = JSON.stringify(payload);
      
      let baseUrl = window.location.href.replace('teacher.html', 'student.html');
      const lastSlash = baseUrl.lastIndexOf('/');
      baseUrl = baseUrl.substring(0, lastSlash) + '/student.html';
      
      const shortId = Math.random().toString(36).substring(2, 8);
      
      generateBtn.disabled = true;
      generateBtn.textContent = 'Menyimpan Link...';
      
      fetch(getGASUrl(), {
         method: 'POST',
         mode: 'no-cors',
         headers: { 'Content-Type': 'text/plain;charset=utf-8' },
         body: JSON.stringify({ action: 'saveLink', id: shortId, payload: payloadString })
      }).then(() => {
         let gMatch = getGASUrl().match(/\/s\/(.*?)\//);
         let gParam = gMatch ? "&g=" + gMatch[1] : "";
         const finalUrl = `${baseUrl}?id=${shortId}${gParam}`;
         
         linkOutput.value = finalUrl;
         resultBox.style.display = 'block';
         
         // Clear
         selectedVocabs = {};
         updateCombinedView();
         document.getElementById('vocab-selection-container').style.display = 'none';
         
      }).catch(err => {
         alert("Gagal menyimpan link: " + err);
      }).finally(() => {
         generateBtn.textContent = 'Buat Link Tugas';
         updateGenerateBtn();
      });
    });

    copyBtn.addEventListener('click', () => {
      linkOutput.select();
      document.execCommand('copy');
      const st = document.getElementById('copy-status');
      st.style.display = 'block';
      setTimeout(() => st.style.display = 'none', 3000);
    });

    // --- HISTORY LOGIC ---
    async function fetchTasks() {
       showLoading("Memuat Riwayat Tugas...");
       const tbody = document.getElementById('task-list-body');
       tbody.innerHTML = '';
       try {
          const res = await fetch(`${getGASUrl()}?action=getTasks`);
          const d = await res.json();
          if (d.status === 'success' && d.data) {
             window.allHistoryTasks = d.data.reverse();
             
             const filterSelect = document.getElementById('history-teacher-filter');
             const currentVal = filterSelect.value;
             filterSelect.innerHTML = '<option value="ALL">Semua Guru</option>';
             const teacherSet = new Set();
             
             window.allHistoryTasks.forEach(t => {
                try {
                   const payload = JSON.parse(t.payload);
                   if (payload.guru) teacherSet.add(payload.guru);
                } catch(e) {}
             });
             
             for (const t in DB_TEACHERS) {
                 teacherSet.add(t);
             }
             
             Array.from(teacherSet).sort().forEach(tName => {
                 const opt = document.createElement('option');
                 opt.value = tName;
                 opt.textContent = tName;
                 filterSelect.appendChild(opt);
             });
             if(teacherSet.has(currentVal)) filterSelect.value = currentVal;
             
             renderHistoryTable();
          }
       } catch (err) {
          console.error(err);
          alert("Gagal memuat riwayat tugas.");
       }
       hideLoading();
    }
    
    function renderHistoryTable() {
       const tbody = document.getElementById('task-list-body');
       tbody.innerHTML = '';
       if (!window.allHistoryTasks) return;
       
       const filterGuru = document.getElementById('history-teacher-filter').value;
       
       window.allHistoryTasks.forEach(t => {
          let payload = {};
          try { payload = JSON.parse(t.payload); } catch(e) {}
          const cls = payload.cls || '-';
          const guru = payload.guru || '-';
          
          if (filterGuru !== 'ALL' && guru !== filterGuru) return;
          
          let babStr = [];
          if(payload.v) {
             for(const b in payload.v) {
                for(const u in payload.v[b]) {
                   babStr.push(`${b} ${u}`);
                }
             }
          }
          const dateObj = new Date(t.date);
          const dateStr = dateObj.toLocaleDateString('id-ID');
          
          const tr = document.createElement('tr');
          tr.innerHTML = `
             <td>${dateStr}</td>
             <td>${guru}</td>
             <td>${cls}</td>
             <td><small>${babStr.join(', ')}</small></td>
             <td>
                <button class="btn" style="padding:6px 12px; margin-bottom:5px;" onclick="viewTaskResults('${t.id}', '${cls}', '${babStr.join(', ')}')">Lihat Hasil</button>
                <button class="btn copy-btn" style="padding:6px 12px; color:red; border-color:red;" onclick="deleteTask('${t.id}')">Hapus</button>
             </td>
          `;
          tbody.appendChild(tr);
       });
    }
    
    async function viewTaskResults(id, cls, babInfo) {
       document.getElementById('detail-task-id').textContent = `ID Tugas: ${id} (Kelas ${cls})`;
       document.getElementById('detail-task-info').textContent = `Bab: ${babInfo}`;
       const tbody = document.getElementById('task-results-body');
       tbody.innerHTML = '<tr><td colspan="5">Memuat data...</td></tr>';
       
       showView('view-task-details');
       try {
          const res = await fetch(`${getGASUrl()}?action=getTaskResults&cls=${cls}`);
          const d = await res.json();
          tbody.innerHTML = '';
          if (d.status === 'success' && d.data) {
             d.data.forEach(r => {
                // To filter we should actually check if the result belongs to this task ID?
                // Wait, original GAS didn't save Task ID. It only saves "Tugas" string.
                // We'll just show all results for the class for now since old results don't have task ID.
                const tr = document.createElement('tr');
                tr.innerHTML = `
                   <td>${r.name}</td>
                   <td>${r.time}</td>
                   <td>${r.status}</td>
                   <td>${r.count}</td>
                   <td><small>${r.mistakes}</small></td>
                `;
                tbody.appendChild(tr);
             });
          }
       } catch (err) {
          tbody.innerHTML = '<tr><td colspan="5">Gagal memuat data.</td></tr>';
       }
    }
    
    async function deleteTask(id) {
       if(!confirm('Yakin ingin menghapus tugas ini? Link tidak akan bisa dibuka lagi.')) return;
       showLoading("Menghapus...");
       try {
          await fetch(getGASUrl(), {
             method: 'POST',
             mode: 'no-cors',
             body: JSON.stringify({ action: 'deleteLink', id: id })
          });
          setTimeout(fetchTasks, 1000);
       } catch(err) {
          hideLoading();
          alert("Error: " + err);
       }
    }

    // --- OPTIONS LOGIC ---
    function renderTeachersOptions() {
       const tbody = document.getElementById('teachers-tbody');
       tbody.innerHTML = '';
       for(const t in DB_TEACHERS) {
          let classes = "";
          if (Array.isArray(DB_TEACHERS[t])) classes = DB_TEACHERS[t].join(', ');
          else if (typeof DB_TEACHERS[t] === 'string') classes = DB_TEACHERS[t];
          addTeacherRowUI(t, classes);
       }
    }
    
    function addTeacherRowUI(name = "", classes = "") {
       const tbody = document.getElementById('teachers-tbody');
       const tr = document.createElement('tr');
       tr.innerHTML = `
          <td><input type="text" class="t-name" value="${name}" placeholder="Nama Guru"></td>
          <td><input type="text" class="t-classes" value="${classes}" placeholder="1A, 1B"></td>
          <td><button class="btn copy-btn" style="color:red; border-color:red; padding:8px;" onclick="this.closest('tr').remove()">Hapus</button></td>
       `;
       tbody.appendChild(tr);
    }
    
    function addTeacherRow() { addTeacherRowUI(); }
    
    function saveTeachers() {
       const tbody = document.getElementById('teachers-tbody');
       const rows = tbody.querySelectorAll('tr');
       const newDB = {};
       rows.forEach(r => {
          const name = r.querySelector('.t-name').value.trim();
          const cls = r.querySelector('.t-classes').value.trim();
          if(name) {
             newDB[name] = cls.split(',').map(s => s.trim()).filter(s => s);
          }
       });
       DB_TEACHERS = newDB;
       
       showLoading("Menyimpan...");
       fetch(getGASUrl(), {
          method: 'POST',
          mode: 'no-cors',
          body: JSON.stringify({ action: 'saveTeachers', payload: JSON.stringify(DB_TEACHERS) })
       }).then(() => {
          hideLoading();
          alert('Konfigurasi Guru disimpan!');
          initDashboard(); // Refresh dropdown
       }).catch(e => {
          hideLoading();
          alert('Error: ' + e);
       });
    }
    
    function downloadStudentsExcel() {
       const wb = XLSX.utils.book_new();
       // Create 30 sheets
       const classes = ["1A", "1B", "1C", "1D", "1E", "2A", "2B", "2C", "2D", "2E", "3A", "3B", "3C", "3D", "3E", "4A", "4B", "4C", "4D", "4E", "5A", "5B", "5C", "5D", "5E", "6A", "6B", "6C", "6D", "6E"];
       
       classes.forEach(c => {
          let data = [["No. Absen", "Nama Lengkap"]];
          let students = DB_STUDENTS[c];
          // fallback to old DB if not loaded
          if (!students && typeof _studentsDB !== 'undefined') students = _studentsDB[c];
          
          if(students) {
             students.forEach((name, i) => {
                data.push([i+1, name]);
             });
          }
          const ws = XLSX.utils.aoa_to_sheet(data);
          XLSX.utils.book_append_sheet(wb, ws, c);
       });
       
       XLSX.writeFile(wb, "Data_Siswa_BrushMaster.xlsx");
    }
    
    function uploadStudentsExcel(e) {
       const file = e.target.files[0];
       if(!file) return;
       const reader = new FileReader();
       reader.onload = function(evt) {
          const data = evt.target.result;
          const wb = XLSX.read(data, {type: 'binary'});
          const newDB = {};
          
          wb.SheetNames.forEach(sheetName => {
             const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {header: 1});
             const students = [];
             for(let i=1; i<rows.length; i++) {
                if(rows[i] && rows[i][1]) {
                   students.push(rows[i][1].toString().trim());
                }
             }
             if(students.length > 0) newDB[sheetName] = students;
          });
          
          DB_STUDENTS = newDB;
          document.getElementById('student-upload-status').textContent = "File Excel berhasil dibaca! Menyimpan ke server...";
          
          fetch(getGASUrl(), {
             method: 'POST',
             mode: 'no-cors',
             body: JSON.stringify({ action: 'saveStudents', payload: JSON.stringify(DB_STUDENTS) })
          }).then(() => {
             document.getElementById('student-upload-status').textContent = "Berhasil disimpan di Server!";
             setTimeout(() => document.getElementById('student-upload-status').textContent = "", 3000);
          }).catch(err => {
             document.getElementById('student-upload-status').textContent = "Gagal menyimpan ke server.";
          });
       };
       reader.readAsBinaryString(file);
    }
    
    function saveCustomGasUrl() {
       const url = document.getElementById('custom-gas-url').value.trim();
       if(url) {
          localStorage.setItem('customGASUrl', url);
       } else {
          localStorage.removeItem('customGASUrl');
       }
       alert("URL Server berhasil disimpan. Halaman akan dimuat ulang.");
       window.location.reload();
    }
  