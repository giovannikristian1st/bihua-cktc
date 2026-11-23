// =========================================================
// SUPABASE DATABASE CLIENT FOR BRUSH MASTER / HANZI APP
// =========================================================

var DB = {
   url: APP_CONFIG.SUPABASE_URL || "https://psefuefaejeajfkfpgyp.supabase.co",
   key: APP_CONFIG.SUPABASE_ANON_KEY || "sb_publishable__nfR4zELcGSfvZEAlMkGsA_IS50n1b5",

   getHeaders: function(extraHeaders) {
      return Object.assign({
         'apikey': this.key,
         'Authorization': 'Bearer ' + this.key,
         'Content-Type': 'application/json',
         'Prefer': 'return=representation'
      }, extraHeaders || {});
   },

   // --- TASKS ---
   saveTask: async function(id, payloadString, teacherName, className) {
      const res = await fetch(`${this.url}/rest/v1/tasks`, {
         method: 'POST',
         headers: this.getHeaders(),
         body: JSON.stringify({
            id: id,
            payload: payloadString,
            teacher_name: teacherName || "",
            class: className || ""
         })
      });
      if (!res.ok) {
         const err = await res.text();
         throw new Error("Gagal menyimpan tugas: " + err);
      }
      return await res.json();
   },

   getTask: async function(id) {
      const res = await fetch(`${this.url}/rest/v1/tasks?id=eq.${encodeURIComponent(id)}&select=*`, {
         headers: this.getHeaders()
      });
      if (!res.ok) throw new Error("Gagal memuat tugas");
      const data = await res.json();
      return (data && data.length > 0) ? data[0] : null;
   },

   getTasks: async function() {
      const res = await fetch(`${this.url}/rest/v1/tasks?select=*&order=created_at.desc`, {
         headers: this.getHeaders()
      });
      if (!res.ok) return [];
      return await res.json();
   },

   updateTask: async function(id, payloadString, teacherName, className) {
      const bodyData = {
         payload: payloadString
      };
      if (teacherName !== undefined) bodyData.teacher_name = teacherName || "";
      if (className !== undefined) bodyData.class = className || "";

      const res = await fetch(`${this.url}/rest/v1/tasks?id=eq.${encodeURIComponent(id)}`, {
         method: 'PATCH',
         headers: Object.assign(this.getHeaders(), {
            'Prefer': 'return=representation'
         }),
         body: JSON.stringify(bodyData)
      });
      if (!res.ok) {
         const err = await res.text();
         throw new Error("Gagal memperbarui tugas: " + err);
      }
      return await res.json();
   },

   getStudentTasksWithStatus: async function(className, studentName) {
      if (!className || !studentName) return [];
      const normCls = className.trim().toUpperCase();
      const normName = studentName.trim().toUpperCase();

      // 1. Fetch all tasks
      const allTasks = await this.getTasks();

      // 2. Fetch student's submissions for this class
      let subs = [];
      try {
         const resSubs = await fetch(`${this.url}/rest/v1/submissions?class=eq.${encodeURIComponent(className)}&select=*`, {
            headers: this.getHeaders()
         });
         if (resSubs.ok) {
            const rawSubs = await resSubs.json();
            subs = (rawSubs || []).filter(s => (s.student_name || '').trim().toUpperCase() === normName && s.status === 'Selesai');
         }
      } catch(e) {
         console.warn("Gagal memuat riwayat submission murid:", e);
      }

      const subsMap = {};
      subs.forEach(s => {
         if (!subsMap[s.task_id]) subsMap[s.task_id] = [];
         subsMap[s.task_id].push(s);
      });

      // 3. Filter relevant tasks for this student
      const result = [];
      allTasks.forEach(t => {
         let p = {};
         try { p = typeof t.payload === 'string' ? JSON.parse(t.payload) : (t.payload || {}); } catch(e) {}

         const tClasses = (Array.isArray(p.classes) && p.classes.length > 0)
            ? p.classes.map(c => String(c).trim().toUpperCase())
            : (t.class || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);

         const isClassMatch = tClasses.includes(normCls);
         const isRemedial = !!(p.type === 'remedial' || (p.rs && typeof p.rs === 'object' && Object.keys(p.rs).length > 0));

         let isAssigned = false;
         if (isRemedial) {
            if (p.rs && typeof p.rs === 'object') {
               const remList = p.rs[className] || p.rs[normCls] || [];
               isAssigned = remList.some(n => String(n).trim().toUpperCase() === normName);
            }
         } else {
            isAssigned = isClassMatch;
         }

         if (isAssigned) {
            const tSubs = subsMap[t.id] || [];
            const isCompleted = tSubs.length > 0;
            result.push({
               id: t.id,
               payload: p,
               teacher_name: t.teacher_name || p.guru || '',
               class_summary: t.class || p.cls || className,
               is_remedial: isRemedial,
               is_completed: isCompleted,
               completions_count: tSubs.length,
               last_submitted_at: isCompleted ? tSubs[tSubs.length - 1].submitted_at : null,
               created_at: t.created_at
            });
         }
      });

      // Sort: uncompleted (tasks to do) first, then by created_at desc
      result.sort((a, b) => {
         if (a.is_completed !== b.is_completed) {
            return a.is_completed ? 1 : -1;
         }
         const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
         const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
         return tB - tA;
      });

      return result;
   },

   deleteTask: async function(id) {
      const res = await fetch(`${this.url}/rest/v1/tasks?id=eq.${encodeURIComponent(id)}`, {
         method: 'DELETE',
         headers: this.getHeaders()
      });
      return res.ok;
   },

   // --- SUBMISSIONS ---
   submitAssignment: async function(taskId, className, studentName, totalMistakes, totalWords, repetitions, duration, mistakesMap, strokeMistakesMap, metaStats) {
      let mistakesDetailStr = "";
      if (mistakesMap && typeof mistakesMap === 'object') {
         const parts = [];
         for (const char in mistakesMap) {
            let sInfo = "";
            if (strokeMistakesMap && strokeMistakesMap[char] && Object.keys(strokeMistakesMap[char]).length > 0) {
               const sParts = [];
               for (const sNum in strokeMistakesMap[char]) {
                  sParts.push(`g${sNum}:${strokeMistakesMap[char][sNum]}`);
               }
               sInfo = ` (${sParts.join(',')})`;
            }
            parts.push(`${char}: ${mistakesMap[char]}${sInfo}`);
         }
         mistakesDetailStr = parts.join(' | ');
      }
      if (metaStats && typeof metaStats === 'object') {
         mistakesDetailStr += " ;; META:" + JSON.stringify(metaStats);
      }

      // Auto ensure task exists in tasks table to prevent foreign key errors for old/direct links
      try {
         await fetch(`${this.url}/rest/v1/tasks`, {
            method: 'POST',
            headers: Object.assign(this.getHeaders(), {
               'Prefer': 'resolution=ignore-duplicates'
            }),
            body: JSON.stringify({
               id: taskId,
               payload: JSON.stringify({ cls: className, r: repetitions }),
               teacher_name: '',
               class: className
            })
         });
      } catch(e) {}

      const res = await fetch(`${this.url}/rest/v1/submissions`, {
         method: 'POST',
         headers: this.getHeaders(),
         body: JSON.stringify({
            task_id: taskId,
            class: className,
            student_name: studentName,
            mistakes_count: totalMistakes || 0,
            total_words: totalWords || 0,
            repetitions: repetitions || 1,
            duration: duration || 0,
            mistakes_detail: mistakesDetailStr,
            status: "Selesai"
         })
      });
      if (!res.ok) {
         const err = await res.text();
         throw new Error("Gagal mengirim hasil: " + err);
      }
      return await res.json();
   },

   computeMaterialKey: function(payload) {
      if (typeof payload === 'string') {
         try { payload = JSON.parse(payload); } catch(e) { return ''; }
      }
      if (!payload) return '';
      const r = payload.r || 1;
      const tm = payload.tm || 0;
      const type = payload.type || 'tugas';
      
      let vParts = [];
      if (payload.v) {
         const books = Object.keys(payload.v).sort();
         for (const b of books) {
            const units = Object.keys(payload.v[b]).sort();
            for (const u of units) {
               vParts.push(b + ':' + u + ':' + payload.v[b][u]);
            }
         }
      } else if (payload.w) {
         vParts = [...payload.w].sort();
      }
      if (payload.cv && Array.isArray(payload.cv)) {
         const cvStrs = payload.cv.map(c => (c.char || '') + ':' + (c.pinyin || '')).sort();
         vParts.push('cv:' + cvStrs.join(','));
      }
      return type + '__r' + r + '__tm' + tm + '__' + vParts.join(';');
   },

   _extractClasses: function(classInput, payload) {
      if (payload && Array.isArray(payload.classes) && payload.classes.length > 0) {
         return payload.classes.map(c => String(c).trim()).filter(c => c && c !== '-' && c.toUpperCase() !== 'ALL');
      }
      const raw = classInput || (payload && payload.cls) || '';
      if (Array.isArray(raw)) {
         return raw.map(c => String(c).trim()).filter(c => c && c !== '-' && c.toUpperCase() !== 'ALL');
      }
      return String(raw).split(',').map(c => c.trim()).filter(c => c && c !== '-' && c.toUpperCase() !== 'ALL');
   },

   _extractGrades: function(classInput, payload) {
      const classes = this._extractClasses(classInput, payload);
      const grades = new Set();
      classes.forEach(c => {
         const g = c.replace(/[^0-9]/g, '');
         if (g) grades.add(g);
      });
      return grades;
   },

   getTaskSubmissions: async function(taskId, className) {
      let url = `${this.url}/rest/v1/submissions?task_id=eq.${encodeURIComponent(taskId)}&select=*&order=submitted_at.desc`;
      const classes = this._extractClasses(className);
      if (classes.length === 1) {
         url += `&class=eq.${encodeURIComponent(classes[0])}`;
      }
      const res = await fetch(url, { headers: this.getHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      if (classes.length > 1) {
         const clsSet = new Set(classes.map(c => c.toUpperCase()));
         return data.filter(s => s.class && clsSet.has(s.class.trim().toUpperCase()));
      }
      return data;
   },

   _aggregateLeaderboard: function(subs) {
      const stats = {};
      subs.forEach(s => {
         const key = `${s.student_name}__${s.class}`;
         const dur = parseFloat(s.duration) || 0;
         if (!stats[key]) {
            stats[key] = { name: s.student_name, cls: s.class, completions: 0, fastestTime: dur > 0 ? dur : 999999 };
         }
         stats[key].completions += 1;
         if (dur > 0 && dur < stats[key].fastestTime) {
            stats[key].fastestTime = dur;
         }
      });
      return Object.values(stats).map(s => ({
         name: s.name,
         cls: s.cls,
         completions: s.completions,
         fastestTime: s.fastestTime === 999999 ? 0 : s.fastestTime
      }));
   },

   getLeaderboard: async function(taskId, className, scope) {
      // 1. Task-wide or Single-Class Scope
      if (scope === 'task') {
         const subs = await this.getTaskSubmissions(taskId);
         return this._aggregateLeaderboard(subs);
      }

      if (scope !== 'grade') {
         const classes = this._extractClasses(className);
         const filterCls = (classes.length === 1) ? classes[0] : null;
         const subs = await this.getTaskSubmissions(taskId, filterCls);
         return this._aggregateLeaderboard(subs);
      }

      // 2. Grade-Level Scope (Across all classes in the same grade with identical material & repetitions)
      try {
         const targetTask = await this.getTask(taskId);
         if (!targetTask || !targetTask.payload) {
            const subs = await this.getTaskSubmissions(taskId, className);
            return this._aggregateLeaderboard(subs);
         }

         const targetPayload = JSON.parse(targetTask.payload);
         const targetKey = this.computeMaterialKey(targetPayload);
         let targetGrades = this._extractGrades(className, null);
         if (targetGrades.size === 0) {
            targetGrades = this._extractGrades(targetTask.class, targetPayload);
         }
         const targetClassesUpper = new Set(this._extractClasses(className, targetPayload).map(c => c.toUpperCase()));

         // Fetch all tasks to match identical material in this grade
         const allTasks = await this.getTasks();
         const matchingTaskIds = [];
         
         allTasks.forEach(t => {
            try {
               const p = JSON.parse(t.payload);
               const tGrades = this._extractGrades(t.class, p);
               let gradeMatch = false;
               if (targetGrades.size === 0) {
                  const tClasses = this._extractClasses(t.class, p).map(c => c.toUpperCase());
                  gradeMatch = (t.id === taskId) || tClasses.some(c => targetClassesUpper.has(c));
               } else {
                  for (const g of tGrades) {
                     if (targetGrades.has(g)) {
                        gradeMatch = true;
                        break;
                     }
                  }
               }
               if (gradeMatch) {
                  const tKey = this.computeMaterialKey(p);
                  if (tKey === targetKey) {
                     matchingTaskIds.push(t.id);
                  }
               }
            } catch(e) {}
         });

         if (!matchingTaskIds.includes(taskId)) matchingTaskIds.push(taskId);

         // Fetch submissions for all matching tasks in 1 query
         const idFilter = matchingTaskIds.map(id => encodeURIComponent(id)).join(',');
         const url = `${this.url}/rest/v1/submissions?task_id=in.(${idFilter})&select=*&order=submitted_at.desc`;
         const res = await fetch(url, { headers: this.getHeaders() });
         if (!res.ok) {
            const subs = await this.getTaskSubmissions(taskId, className);
            return this._aggregateLeaderboard(subs);
         }
         let allSubs = await res.json();
         if (targetGrades.size === 1) {
            const gOnly = Array.from(targetGrades)[0];
            allSubs = allSubs.filter(s => {
               const sg = (s.class || '').replace(/[^0-9]/g, '');
               return sg === gOnly || s.task_id === taskId;
            });
         }
         return this._aggregateLeaderboard(allSubs);
      } catch (err) {
         console.warn("Gagal fetch grade leaderboard, fallback to class:", err);
         const subs = await this.getTaskSubmissions(taskId, className);
         return this._aggregateLeaderboard(subs);
      }
   },

   getAllProgressInfo: async function() {
      // Query unique submissions and distinct classes per task
      const res = await fetch(`${this.url}/rest/v1/submissions?select=task_id,student_name,class`, {
         headers: this.getHeaders()
      });
      if (!res.ok) return { countMap: {}, classMap: {} };
      const data = await res.json();
      const studentMap = {};
      const classMap = {};
      data.forEach(row => {
         const tid = row.task_id;
         const sName = (row.student_name || '').trim().toUpperCase();
         const sCls = (row.class || '').trim().toUpperCase();
         if (!sName) return;
         if (!studentMap[tid]) studentMap[tid] = new Set();
         studentMap[tid].add(`${sName}__${sCls}`);
         if (sCls && sCls !== '-' && sCls !== 'TIDAK DIKETAHUI') {
            if (!classMap[tid]) classMap[tid] = new Set();
            classMap[tid].add(sCls);
         }
      });
      const countMap = {};
      for (const tid in studentMap) {
         countMap[tid] = studentMap[tid].size;
      }
      const classListMap = {};
      for (const tid in classMap) {
         classListMap[tid] = Array.from(classMap[tid]);
      }
      return { countMap: countMap, classMap: classListMap };
   },

   getAllProgressCount: async function() {
      const info = await this.getAllProgressInfo();
      return (info && info.countMap) ? info.countMap : {};
   },

   // --- TEACHERS ---
   getTeachers: async function() {
      const res = await fetch(`${this.url}/rest/v1/teachers?select=*`, {
         headers: this.getHeaders()
      });
      if (!res.ok) return null;
      const list = await res.json();
      if (!list || list.length === 0) return null;
      const map = {};
      list.forEach(t => {
         map[t.name] = Array.isArray(t.classes) ? t.classes : (typeof t.classes === 'string' ? JSON.parse(t.classes) : []);
      });
      return map;
   },

   saveTeachers: async function(teachersMap) {
      // Upsert teachers
      const rows = [];
      for (const name in teachersMap) {
         rows.push({
            name: name,
            classes: teachersMap[name],
            updated_at: new Date().toISOString()
         });
      }
      // Delete old & insert new
      await fetch(`${this.url}/rest/v1/teachers?name=not.is.null`, {
         method: 'DELETE',
         headers: this.getHeaders()
      });
      const res = await fetch(`${this.url}/rest/v1/teachers`, {
         method: 'POST',
         headers: this.getHeaders(),
         body: JSON.stringify(rows)
      });
      return res.ok;
   },

   // --- STUDENTS ---
   getStudents: async function() {
      const res = await fetch(`${this.url}/rest/v1/students?select=*`, {
         headers: this.getHeaders()
      });
      if (!res.ok) return null;
      const list = await res.json();
      if (!list || list.length === 0) return null;
      const map = {};
      list.forEach(s => {
         map[s.class] = Array.isArray(s.names) ? s.names : (typeof s.names === 'string' ? JSON.parse(s.names) : []);
      });
      return map;
   },

   saveStudents: async function(studentsMap) {
      const rows = [];
      for (const cls in studentsMap) {
         rows.push({
            class: cls,
            names: studentsMap[cls],
            updated_at: new Date().toISOString()
         });
      }
      await fetch(`${this.url}/rest/v1/students?class=not.is.null`, {
         method: 'DELETE',
         headers: this.getHeaders()
      });
      const res = await fetch(`${this.url}/rest/v1/students`, {
         method: 'POST',
         headers: this.getHeaders(),
         body: JSON.stringify(rows)
      });
      return res.ok;
   },

   // --- STUDENT THEMES ---
   getStudentTheme: async function(className, studentName) {
      const res = await fetch(`${this.url}/rest/v1/student_themes?class=eq.${encodeURIComponent(className)}&student_name=eq.${encodeURIComponent(studentName)}&select=theme`, {
         headers: this.getHeaders()
      });
      if (!res.ok) return 'theme-normal';
      const data = await res.json();
      return (data && data.length > 0) ? data[0].theme : 'theme-normal';
   },

   saveStudentTheme: async function(className, studentName, theme) {
      const res = await fetch(`${this.url}/rest/v1/student_themes`, {
         method: 'POST',
         headers: Object.assign(this.getHeaders(), {
            'Prefer': 'resolution=merge-duplicates'
         }),
         body: JSON.stringify({
            class: className,
            student_name: studentName,
            theme: theme,
            updated_at: new Date().toISOString()
         })
      });
      return res.ok;
   }
};
