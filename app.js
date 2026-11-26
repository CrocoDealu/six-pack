(function () {
  const KEY = "abs30.startDate";
  const TOTAL = 30;
  const app = document.getElementById("app");
  let selected = null;
  let PLAN = {};
  const REST_SECONDS = 10;
  let workout = null; // active guided workout state

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
    return `<div class="card"><h2 style="margin:0">Day ${day}</h2><p class="muted" style="margin:2px 0 8px">${fmt(date)}</p><button class="btn" id="startDay" data-day="${day}">Start Day ${day}</button><p class="muted" style="margin:14px 0 4px">${(PLAN[day] || []).length} exercises</p>${list || '<p class="muted">No exercises listed.</p>'}</div>`;
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
      <div id="dayCard">${dayDetail(show, start)}</div>
      <div class="card"><div class="grid">${grid}</div></div>
      <button class="btn ghost" id="reset">Change start date</button>`;

    app.querySelectorAll(".grid button").forEach((b) => b.onclick = () => {
      selected = Number(b.dataset.day); renderPlan(start);
      const card = document.getElementById("dayCard"); if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const sb = document.getElementById("startDay"); if (sb) sb.onclick = () => startWorkout(Number(sb.dataset.day));
    document.getElementById("reset").onclick = () => { if (confirm("Change your start date?")) { store.clear(); selected = null; render(); } };
  }

  // ---------- Guided workout ----------
  const amountText = (e) => (e.reps != null ? "x" + e.reps : e.seconds + " s");
  const photo = (e, cls) => e.image
    ? `<img class="${cls}" src="${esc(e.image)}" alt="" onerror="this.outerHTML='<div class=&quot;${cls} ph&quot;>?</div>'">`
    : `<div class="${cls} ph">?</div>`;

  let audioCtx = null;
  function beep(freq = 880, ms = 150) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = freq; g.gain.value = 0.15; o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + ms / 1000);
    } catch (e) {}
    try { navigator.vibrate && navigator.vibrate(200); } catch (e) {}
  }

  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && "wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) {}
  }

  // Timer based on wall-clock end time, so it stays right if the phone sleeps.
  function stopTimer() { if (workout && workout.tick) { clearInterval(workout.tick); workout.tick = null; } }
  function runTimer(seconds, onTick, onDone) {
    stopTimer();
    workout.endAt = Date.now() + seconds * 1000;
    workout.paused = false;
    const step = () => {
      const left = Math.max(0, Math.ceil((workout.endAt - Date.now()) / 1000));
      workout.left = left; onTick(left);
      if (left <= 0) { stopTimer(); onDone(); }
    };
    step(); workout.tick = setInterval(step, 250);
  }

  function startWorkout(day) {
    const list = PLAN[day] || [];
    if (!list.length) return;
    workout = { day, list, i: 0, tick: null };
    beep(0, 1); // unlock audio on the user's tap
    keepAwake(true);
    showExercise();
  }

  function exitWorkout() {
    stopTimer(); keepAwake(false); workout = null; render(); window.scrollTo(0, 0);
  }

  function header() {
    const { i, list, day } = workout;
    return `<div class="wo-top">
        <button class="icon-btn" id="woExit" aria-label="Exit workout">✕</button>
        <div class="wo-progress">Day ${day} · ${i + 1} / ${list.length}</div>
        <span style="width:40px"></span>
      </div>
      <div class="bar"><div style="width:${(i / list.length) * 100}%"></div></div>`;
  }

  function bindCommon() {
    document.getElementById("woExit").onclick = () => { if (confirm("Stop this workout?")) exitWorkout(); };
  }

  function showExercise() {
    stopTimer();
    const { i, list } = workout;
    const e = list[i];
    const timed = e.reps == null;
    app.innerHTML = `<div class="wo">
      ${header()}
      ${photo(e, "wo-photo")}
      <h2 class="wo-name">${esc(e.name)}</h2>
      ${timed
        ? `<div class="wo-big" id="woTime">${e.seconds}</div><div class="muted">seconds</div>`
        : `<div class="wo-big">x${e.reps}</div><div class="muted">reps</div>`}
      <div class="wo-actions">
        <button class="btn ghost" id="woPrev" ${i === 0 ? "disabled" : ""}>Back</button>
        ${timed ? `<button class="btn ghost" id="woPause">Pause</button>` : ""}
        <button class="btn" id="woNext">${timed ? "Skip" : "Done"}</button>
      </div>
    </div>`;
    bindCommon();
    document.getElementById("woPrev").onclick = () => { if (workout.i > 0) { workout.i--; showExercise(); } };
    document.getElementById("woNext").onclick = () => nextFromExercise();
    if (timed) {
      const el = document.getElementById("woTime");
      const pauseBtn = document.getElementById("woPause");
      const tick = (left) => { el.textContent = left; if (left > 0 && left <= 3) beep(660, 80); };
      runTimer(e.seconds, tick, () => { beep(990, 300); nextFromExercise(); });
      pauseBtn.onclick = () => {
        if (workout.paused) { pauseBtn.textContent = "Pause"; runTimer(workout.left, tick, () => { beep(990, 300); nextFromExercise(); }); }
        else { stopTimer(); workout.paused = true; pauseBtn.textContent = "Resume"; }
      };
    }
  }

  function nextFromExercise() {
    stopTimer();
    if (workout.i >= workout.list.length - 1) return showDone();
    workout.i++;
    showRest();
  }

  function showRest() {
    const e = workout.list[workout.i];
    app.innerHTML = `<div class="wo rest">
      ${header()}
      <div class="wo-label">Rest</div>
      <div class="wo-big" id="woTime">${REST_SECONDS}</div>
      <div class="wo-actions"><button class="btn ghost" id="woAdd">+10 s</button><button class="btn" id="woSkip">Skip rest</button></div>
      <div class="wo-next">
        <div class="muted">Up next</div>
        <div class="ex">${photo(e, "thumb")}<div class="name">${esc(e.name)}</div><div class="amt">${amountText(e)}</div></div>
      </div>
    </div>`;
    bindCommon();
    const el = document.getElementById("woTime");
    runTimer(REST_SECONDS, (left) => { el.textContent = left; if (left > 0 && left <= 3) beep(660, 80); }, () => { beep(990, 300); showExercise(); });
    document.getElementById("woSkip").onclick = () => showExercise();
    document.getElementById("woAdd").onclick = () => { workout.endAt += 10000; };
  }

  function showDone() {
    stopTimer(); keepAwake(false);
    const { day, list } = workout;
    app.innerHTML = `<div class="wo done">
      <div class="wo-big">🎉</div>
      <h2>Day ${day} done</h2>
      <p class="muted">${list.length} exercises finished.</p>
      <button class="btn" id="woBack">Back to plan</button>
    </div>`;
    document.getElementById("woBack").onclick = exitWorkout;
  }

  function render() { const s = store.get(); s ? renderPlan(s) : renderSetup(); }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (workout) { keepAwake(true); return; } // don't interrupt an active workout
    render();
  });
  fetch("exercises.json")
    .then((r) => r.json())
    .then((d) => { PLAN = d.days; render(); })
    .catch(() => { app.innerHTML = '<p class="muted">Could not load the exercises. Refresh to try again.</p>'; });
})();
