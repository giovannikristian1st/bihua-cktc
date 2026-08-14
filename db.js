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

   deleteTask: async function(id) {
      const res = await fetch(`${this.url}/rest/v1/tasks?id=eq.${encodeURIComponent(id)}`, {
         method: 'DELETE',
         headers: this.getHeaders()
      });
      return res.ok;
   },

   // --- SUBMISSIONS ---
   submitAssignment: async function(taskId, className, studentName, totalMistakes, totalWords, repetitions, duration, mistakesMap) {
      let mistakesDetailStr = "";
      if (mistakesMap && typeof mistakesMap === 'object') {
         const parts = [];
         for (const char in mistakesMap) {
            parts.push(`${char}: ${mistakesMap[char]}`);
         }
         mistakesDetailStr = parts.join(' | ');
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

   getTaskSubmissions: async function(taskId, className) {
      let url = `${this.url}/rest/v1/submissions?task_id=eq.${encodeURIComponent(taskId)}&select=*&order=submitted_at.desc`;
      if (className) {
         url += `&class=eq.${encodeURIComponent(className)}`;
      }
      const res = await fetch(url, { headers: this.getHeaders() });
      if (!res.ok) return [];
      return await res.json();
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
      // 1. Single Class Scope
      if (scope !== 'grade') {
         const subs = await this.getTaskSubmissions(taskId, className);
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
         const gradePrefix = (className || targetTask.class || '').replace(/[^0-9]/g, '');

         // Fetch all tasks to match identical material in this grade
         const allTasks = await this.getTasks();
         const matchingTaskIds = [];
         
         allTasks.forEach(t => {
            try {
               const p = JSON.parse(t.payload);
               const tGrade = (t.class || p.cls || '').replace(/[^0-9]/g, '');
               if (!gradePrefix || tGrade === gradePrefix) {
                  const tKey = this.computeMaterialKey(p);
                  if (tKey === targetKey) {
                     matchingTaskIds.push(t.id);
                  }
               }
            } catch(e) {}
         });

         if (!matchingTaskIds.includes(taskId)) matchingTaskIds.push(taskId);

         // Fetch submissions for all matching tasks in 1 query
         const idFilter = matchingTaskIds.join(',');
         const url = `${this.url}/rest/v1/submissions?task_id=in.(${idFilter})&select=*&order=submitted_at.desc`;
         const res = await fetch(url, { headers: this.getHeaders() });
         if (!res.ok) {
            const subs = await this.getTaskSubmissions(taskId, className);
            return this._aggregateLeaderboard(subs);
         }
         const allSubs = await res.json();
         return this._aggregateLeaderboard(allSubs);
      } catch (err) {
         console.warn("Gagal fetch grade leaderboard, fallback to class:", err);
         const subs = await this.getTaskSubmissions(taskId, className);
         return this._aggregateLeaderboard(subs);
      }
   },

   getAllProgressCount: async function() {
      // Query unique submissions per task
      const res = await fetch(`${this.url}/rest/v1/submissions?select=task_id,student_name`, {
         headers: this.getHeaders()
      });
      if (!res.ok) return {};
      const data = await res.json();
      const map = {};
      data.forEach(row => {
         const tid = row.task_id;
         if (!map[tid]) map[tid] = new Set();
         map[tid].add(row.student_name);
      });
      const countMap = {};
      for (const tid in map) {
         countMap[tid] = map[tid].size;
      }
      return countMap;
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
