(function () {
  const KEY = "abs30.startDate";
  const TOTAL = 30;
  const app = document.getElementById("app");
  let selected = null;
  let PLAN = {};

  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} },
    clear() { try { localStorage.removeItem(KEY); } catch (e) {} },
  };

  // Local-date helpers (avoid UTC shifts from new Date("YYYY-MM-DD"))
  const pad = (n) => String(n).padStart(2, "0");
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const daysBetween = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
  const isRest = (day) => day % 4 === 0;
  const fmt = (d) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  function currentDay(start) { return daysBetween(fromISO(start), new Date()) + 1; }
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function renderSetup() {
    app.innerHTML = `
      <h1>30 Day Abs</h1>
      <p class="muted">3 workout days, then a rest day, for 30 days.</p>
      <div class="card">
        <label for="start">When do you start?</label>
        <input type="date" id="start" value="${toISO(new Date())}">
        <button class="btn" id="go">Start the plan</button>
      </div>`;
    document.getElementById("go").onclick = () => {
      const v = document.getElementById("start").value;
      if (!v) return;
      store.set(v); selected = null; render();
    };
  }

  function dayDetail(day, start) {
    const date = new Date(fromISO(start)); date.setDate(date.getDate() + day - 1);
    if (isRest(day)) {
      return `<div class="card"><h2 style="margin:0">Day ${day} · Rest</h2><p class="muted" style="margin:2px 0 8px">${fmt(date)}</p><p>Recovery day. Stretch, walk, hydrate.</p></div>`;
    }
    const list = (PLAN[day] || []).map((e) => `
      <div class="ex">
        ${e.image ? `<img class="thumb" src="${esc(e.image)}" alt="" loading="lazy" width="64" height="64" onerror="this.outerHTML='<div class=&quot;thumb ph&quot; aria-hidden=&quot;true&quot;>?</div>'">` : `<div class="thumb ph" aria-hidden="true">?</div>`}
        <div class="name">${esc(e.name)}</div>
        <div class="amt">${e.reps != null ? "x" + e.reps : e.seconds + " s"}</div>
      </div>`).join("");
    return `<div class="card"><h2 style="margin:0">Day ${day}</h2><p class="muted" style="margin:2px 0 8px">${fmt(date)}</p><p class="muted" style="margin:0 0 4px">${(PLAN[day] || []).length} exercises</p>${list || '<p class="muted">No exercises listed.</p>'}</div>`;
  }

  function renderPlan(start) {
    const today = currentDay(start);
    const show = selected ?? Math.min(Math.max(today, 1), TOTAL);
    let hero;
    if (today < 1) hero = `<div class="big">${1 - today}<small> day${today === 0 ? "" : "s"}</small></div><div class="muted">until you start</div>`;
    else if (today > TOTAL) hero = `<div class="big">Done</div><div class="muted">You finished all 30 days</div>`;
    else hero = `<div class="big">${today}<small> / ${TOTAL}</small></div><span class="badge ${isRest(today) ? "rest" : ""}">${isRest(today) ? "Rest day" : "Workout day"}</span>`;

    let grid = "";
    for (let d = 1; d <= TOTAL; d++) {
      const cls = [isRest(d) && "rest", d < today && "past", d === today && "today", d === show && d !== today && "sel"].filter(Boolean).join(" ");
      grid += `<button class="${cls}" data-day="${d}">${isRest(d) ? "R" : d}</button>`;
    }

    app.innerHTML = `
      <h1>30 Day Abs</h1>
      <p class="muted" style="margin:0">Started ${fmt(fromISO(start))}</p>
      <div class="card hero">${hero}</div>
      ${dayDetail(show, start)}
      <div class="card"><div class="grid">${grid}</div></div>
      <button class="btn ghost" id="reset">Change start date</button>`;

    app.querySelectorAll(".grid button").forEach((b) => b.onclick = () => { selected = Number(b.dataset.day); renderPlan(start); });
    document.getElementById("reset").onclick = () => { if (confirm("Change your start date?")) { store.clear(); selected = null; render(); } };
  }

  function render() { const s = store.get(); s ? renderPlan(s) : renderSetup(); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
  fetch("exercises.json")
    .then((r) => r.json())
    .then((d) => { PLAN = d.days; render(); })
    .catch(() => { app.innerHTML = '<p class="muted">Could not load the exercises. Refresh to try again.</p>'; });
})();
