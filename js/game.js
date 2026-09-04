(() => {
  "use strict";

  const WIN_DAY = 36;
  const OPEN_STREAK = 8;
  const QUEUE_FAIL = 12;
  const BUDGET_START = 48;
  const TICK_MS = 2000;

  const WATCHES = ["Morning watch", "Afternoon watch", "First night watch"];

  const SECTORS = {
    holding: { x: 848, y: 448, label: "Holding", jobs: ["escort", "relocate", "hold"] },
    inbound: { x: 640, y: 318, label: "Inbound lane", jobs: ["escort", "sweep", "hold", "relocate"] },
    outbound: { x: 700, y: 378, label: "Outbound lane", jobs: ["escort", "sweep", "hold", "relocate"] },
    strait: { x: 560, y: 300, label: "Strait", jobs: ["escort", "hold", "relocate"] },
    safer: { x: 220, y: 470, label: "Safer water", jobs: ["hold", "relocate"] },
    gulf: { x: 160, y: 330, label: "Persian Gulf", jobs: ["hold", "relocate"] },
    oman: { x: 880, y: 520, label: "Gulf of Oman", jobs: ["relocate", "hold"] },
  };

  const NESTS_DEF = [
    { id: "abbas", name: "Shore nest, Bandar Abbas", x: 700, y: 148, threat: 2 },
    { id: "west", name: "Shore nest, west bluff", x: 430, y: 168, threat: 1 },
  ];

  const JOB_SHAPES = [
    { id: "holding", actionHint: "escort", label: "ESCORT / HOLD", x: 790, y: 405, w: 175, h: 95 },
    { id: "inbound", actionHint: "sweep", label: "INBOUND LANE", x: 520, y: 268, w: 210, h: 70 },
    { id: "outbound", actionHint: "sweep", label: "OUTBOUND LANE", x: 610, y: 348, w: 200, h: 62 },
    { id: "strait", actionHint: "hold", label: "STRAIT STATION", x: 430, y: 278, w: 85, h: 58 },
    { id: "safer", actionHint: "relocate", label: "SAFER WATER", x: 70, y: 430, w: 230, h: 95 },
    { id: "gulf", actionHint: "relocate", label: "GULF APPROACH", x: 40, y: 250, w: 200, h: 80 },
  ];

  const $ = (id) => document.getElementById(id);

  let state;
  let timer = null;
  let pendingAction = null;

  function newState() {
    return {
      day: 1,
      watch: 0,
      queue: 6,
      budget: BUDGET_START,
      streak: 0,
      speed: 0,
      over: null,
      selected: null,
      log: [],
      units: [
        { id: "escort", kind: "escort", name: "Escort Group", sector: "safer", job: null, busy: 0, hits: 0, maxHits: 3 },
        { id: "frigate", kind: "frigate", name: "Frigate Group", sector: "holding", job: null, busy: 0, hits: 0, maxHits: 2 },
        { id: "mcm", kind: "mcm", name: "MCM Group", sector: "oman", job: null, busy: 0, hits: 0, maxHits: 2 },
        { id: "carrier", kind: "carrier", name: "Carrier Group", sector: "gulf", job: null, busy: 0, hits: 0, maxHits: 2, cooldown: 0, capital: true },
      ],
      mines: [],
      swarms: [],
      nests: NESTS_DEF.map((n) => ({ ...n, active: n.id === "abbas", down: 0 })),
      transits: [],
      lastOdds: 0.64,
    };
  }

  function log(text) {
    state.log.unshift({ day: state.day, watch: state.watch, text });
    if (state.log.length > 80) state.log.length = 80;
  }

  function unitById(id) {
    return state.units.find((u) => u.id === id);
  }

  function escortsCovering() {
    return state.units.filter((u) => {
      if (u.kind !== "escort" && u.kind !== "frigate") return false;
      if (!u.job) return false;
      return u.job.type === "escort" || (u.job.type === "hold" && (u.sector === "inbound" || u.sector === "outbound" || u.sector === "strait" || u.sector === "holding"));
    });
  }

  function airCover() {
    const c = unitById("carrier");
    if (!c || c.hits >= c.maxHits) return false;
    return c.job && (c.job.type === "hold" || c.job.type === "escort");
  }

  function nestThreat() {
    return state.nests.reduce((sum, n) => sum + (n.active && n.down <= 0 ? n.threat : 0), 0);
  }

  function minesInLane() {
    return state.mines.filter((m) => m.sector === "inbound" || m.sector === "outbound" || m.sector === "strait").length;
  }

  function activeSwarms() {
    return state.swarms.filter((s) => s.ttl > 0).length;
  }

  function transitOdds() {
    let risk = 0.16;
    risk += minesInLane() * 0.11;
    risk += activeSwarms() * 0.09;
    risk += nestThreat() * 0.07;
    const escortN = escortsCovering().length;
    risk -= escortN * 0.13;
    if (state.units.some((u) => u.kind === "mcm" && u.job && u.job.type === "sweep")) risk -= 0.05;
    if (airCover()) risk -= 0.06;
    const clear = Math.max(0.12, Math.min(0.94, 1 - risk));
    state.lastOdds = clear;
    return clear;
  }

  function riskWord(odds) {
    if (odds >= 0.72) return { word: "Open", cls: "ok" };
    if (odds >= 0.48) return { word: "Contested", cls: "mid" };
    return { word: "Closed pressure", cls: "hot" };
  }

  function canUnitDo(unit, action) {
    if (!unit || state.over) return false;
    if (unit.busy > 0 && action !== "relocate") return false;
    if (action === "escort") return unit.kind === "escort" || unit.kind === "frigate";
    if (action === "sweep") return unit.kind === "mcm";
    if (action === "strike") return unit.kind === "carrier" && unit.cooldown <= 0;
    if (action === "hold" || action === "relocate") return true;
    return false;
  }

  function inferAction(unit, sectorId) {
    if (sectorId === "abbas" || sectorId === "west") return canUnitDo(unit, "strike") ? "strike" : null;
    const sec = SECTORS[sectorId];
    if (!sec) return null;
    if (pendingAction && sec.jobs.includes(pendingAction) && canUnitDo(unit, pendingAction)) return pendingAction;
    if ((sectorId === "holding" || sectorId === "inbound" || sectorId === "outbound" || sectorId === "strait") && canUnitDo(unit, "escort")) return "escort";
    if ((sectorId === "inbound" || sectorId === "outbound") && canUnitDo(unit, "sweep")) return "sweep";
    if (canUnitDo(unit, "hold") && (sectorId === "strait" || sectorId === "inbound" || sectorId === "safer")) return "hold";
    if (canUnitDo(unit, "relocate")) return "relocate";
    return null;
  }

  function issueOrder(unit, action, target) {
    if (!canUnitDo(unit, action) && action !== "relocate") return;
    if (action === "strike") {
      const nest = state.nests.find((n) => n.id === target);
      if (!nest) return;
      unit.job = { type: "strike", nest: nest.id };
      unit.busy = 1;
      unit.sector = nest.id === "west" ? "gulf" : "strait";
      log(`${unit.name} is going for the ${nest.name.toLowerCase()}.`);
    } else if (action === "sweep") {
      const sector = SECTORS[target] ? target : "inbound";
      unit.job = { type: "sweep", sector, left: 3 };
      unit.busy = 3;
      unit.sector = sector;
      log(`${unit.name} starts a sweep on the ${SECTORS[sector].label.toLowerCase()}.`);
    } else if (action === "escort") {
      const sector = SECTORS[target] ? target : "holding";
      unit.job = { type: "escort", sector, left: 3 };
      unit.busy = 3;
      unit.sector = sector === "holding" ? "inbound" : sector;
      log(`${unit.name} takes a tanker group through.`);
    } else if (action === "hold") {
      const sector = SECTORS[target] ? target : unit.sector;
      unit.job = { type: "hold", sector };
      unit.busy = 0;
      unit.sector = sector;
      log(`${unit.name} holds station in ${SECTORS[sector].label.toLowerCase()}.`);
    } else if (action === "relocate") {
      const sector = SECTORS[target] ? target : "safer";
      unit.job = { type: "relocate", sector };
      unit.busy = 1;
      unit.sector = sector;
      log(`${unit.name} relocates to ${SECTORS[sector].label.toLowerCase()}.`);
    }
    pendingAction = null;
    render();
  }

  function resolveJobs() {
    for (const unit of state.units) {
      if (!unit.job) continue;
      if (unit.job.type === "sweep") {
        unit.job.left -= 1;
        if (unit.job.left <= 0) {
          const before = state.mines.length;
          state.mines = state.mines.filter((m) => m.sector !== unit.job.sector);
          const cleared = before - state.mines.length;
          log(cleared ? `${unit.name} clears ${cleared} mine${cleared > 1 ? "s" : ""} from the ${SECTORS[unit.job.sector].label.toLowerCase()}.` : `${unit.name} finishes a sweep. Lane looks clean.`);
          unit.job = { type: "hold", sector: unit.sector };
        }
      } else if (unit.job.type === "escort") {
        unit.job.left -= 1;
        if (unit.job.left <= 0) {
          unit.job = { type: "hold", sector: unit.sector };
          log(`${unit.name} drops the convoy and holds the lane.`);
        }
      } else if (unit.job.type === "relocate") {
        unit.job = { type: "hold", sector: unit.sector };
      } else if (unit.job.type === "strike") {
        const nest = state.nests.find((n) => n.id === unit.job.nest);
        const shot = Math.random();
        if (shot < 0.1) {
          unit.hits += 1;
          log(`Fire comes back off the coast. ${unit.name} takes a hit.`);
          if (unit.hits >= unit.maxHits) {
            sinkCapital(unit);
            return;
          }
        }
        if (nest) {
          nest.down = 5;
          nest.active = false;
          log(`Strike goes in. ${nest.name} goes quiet.`);
        }
        unit.cooldown = 4;
        unit.job = { type: "hold", sector: unit.sector };
      }
      if (unit.busy > 0) unit.busy -= 1;
      if (unit.cooldown > 0) unit.cooldown -= 1;
    }
  }

  function sinkCapital(unit) {
    log(`${unit.name} is sunk.`);
    endGame("lose", "The carrier group is sunk. That is a hard fail.");
  }

  function resolveTransits() {
    const attempts = state.queue > 0 ? (state.queue >= 9 ? 2 : 1) : 0;
    const odds = transitOdds();
    let cleared = 0;
    let hit = 0;
    for (let i = 0; i < attempts; i += 1) {
      if (state.queue <= 0) break;
      if (Math.random() < odds) {
        state.queue -= 1;
        cleared += 1;
        state.transits.push({ t: 0, ok: true });
      } else {
        hit += 1;
        state.queue += 1;
        state.budget -= 2;
        state.transits.push({ t: 0, ok: false });
      }
    }
    if (cleared) log(cleared === 1 ? "Convoy clears the Strait." : `${cleared} groups clear the Strait.`);
    if (hit) log(hit === 1 ? "A tanker is hit. Queue lengthens. Budget burns." : `${hit} tankers are hit. Queue jumps. Budget burns.`);

    if (Math.random() < 0.4) state.queue += 1;
    if (state.queue > 16) state.queue = 16;

    const open = odds >= 0.72 && cleared > 0 && hit === 0;
    state.streak = open ? state.streak + 1 : 0;
    if (open && state.streak >= 3) log(`Lane has stayed open ${state.streak} watches.`);
  }

  function spawnThreats() {
    const odds = state.lastOdds;
    const late = state.day >= 12;
    const pressure = (odds > 0.7 ? 1.25 : 0.85) + (late ? 0.2 : 0);

    if (state.mines.filter((m) => m.sector === "inbound").length < 4 && Math.random() < 0.22 * pressure) {
      state.mines.push({ sector: "inbound", x: 560 + Math.random() * 140, y: 290 + Math.random() * 40 });
      log("Minefield laid on the inbound lane.");
    }
    if (state.day >= 4 && state.mines.filter((m) => m.sector === "outbound").length < 3 && Math.random() < 0.16 * pressure) {
      state.mines.push({ sector: "outbound", x: 640 + Math.random() * 120, y: 350 + Math.random() * 40 });
      log("Mines appear on the outbound lane.");
    }

    if (state.swarms.length < 2 && Math.random() < 0.18 * pressure) {
      const sector = Math.random() < 0.5 ? "inbound" : "outbound";
      const origin = SECTORS[sector];
      state.swarms.push({
        sector,
        ttl: 3,
        x: origin.x + (Math.random() * 40 - 20),
        y: origin.y + (Math.random() * 24 - 10),
      });
      log(Math.random() < 0.5 ? "UAV swarm inbound." : "Fast boats pushing the lane.");
    }

    if (state.day >= 6 && Math.random() < 0.2) {
      const quiet = state.nests.find((n) => !n.active && n.down <= 0);
      if (quiet) {
        quiet.active = true;
        log(`${quiet.name} lights up. Lane risk rises.`);
      }
    }

    for (const nest of state.nests) {
      if (nest.down > 0) {
        nest.down -= 1;
        if (nest.down === 0 && Math.random() < 0.55) {
          nest.active = true;
          log(`${nest.name} is back up.`);
        }
      }
    }

    for (const swarm of state.swarms) swarm.ttl -= 1;
    state.swarms = state.swarms.filter((s) => s.ttl > 0);

    if (nestThreat() > 0 && Math.random() < 0.2 + nestThreat() * 0.06) {
      const targets = state.units.filter((u) => u.sector !== "safer");
      const target = targets[Math.floor(Math.random() * targets.length)] || unitById("carrier");
      if (target) {
        const hitChance = target.kind === "carrier" ? 0.22 : 0.16;
        log(Math.random() < 0.5 ? `Missile shot at ${target.name}.` : `UAV run on ${target.name}.`);
        if (Math.random() < hitChance) {
          target.hits += 1;
          log(`${target.name} is hit.`);
          if (target.capital && target.hits >= target.maxHits) {
            sinkCapital(target);
            return;
          }
          if (!target.capital && target.hits >= target.maxHits) {
            log(`${target.name} is out of the fight. Hull is finished.`);
            target.busy = 99;
            target.job = null;
          }
        } else {
          log(`${target.name} shrugs it off.`);
        }
      }
    }

    if (state.day === 2 && state.mines.length === 0) {
      state.mines.push({ sector: "inbound", x: 600, y: 305 });
      state.mines.push({ sector: "inbound", x: 655, y: 318 });
      log("Minefield laid on the inbound lane.");
    }
    if (state.day === 5 && state.swarms.length === 0) {
      state.swarms.push({ sector: "outbound", ttl: 3, x: 710, y: 372 });
      log("UAV swarm inbound.");
    }
  }

  function checkEnd() {
    if (state.over) return;
    if (state.queue >= QUEUE_FAIL) {
      endGame("lose", "The tanker queue hit 12. The gulf is closed.");
      return;
    }
    if (state.budget <= 0) {
      endGame("lose", "Time and political budget are gone before traffic recovered.");
      return;
    }
    if (state.streak >= OPEN_STREAK) {
      endGame("win", `The lane stayed open ${OPEN_STREAK} watches in a row. Traffic is moving.`);
      return;
    }
    if (state.day >= WIN_DAY) {
      endGame("win", `Day ${WIN_DAY}. Queue stayed under ${QUEUE_FAIL}. The gulf is still open.`);
    }
  }

  function endGame(kind, reason) {
    state.over = { kind, reason };
    state.speed = 0;
    stopClock();
    render();
  }

  function tick() {
    if (state.over) return;
    resolveJobs();
    if (state.over) return;
    resolveTransits();
    spawnThreats();
    state.budget -= 1;
    for (const t of state.transits) t.t += 1;
    state.transits = state.transits.filter((t) => t.t < 8);
    checkEnd();
    if (state.over) return;
    state.watch = (state.watch + 1) % WATCHES.length;
    state.day += 1;
    render();
  }

  function stopClock() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function setSpeed(speed) {
    state.speed = speed;
    stopClock();
    if (speed > 0 && !state.over) {
      timer = setInterval(tick, TICK_MS / speed);
    }
    render();
  }

  function unitPoint(unit) {
    if (unit.job && unit.job.type === "strike") {
      const nest = state.nests.find((n) => n.id === unit.job.nest);
      if (nest) return { x: nest.x + 18, y: nest.y + 36 };
    }
    const sec = SECTORS[unit.sector] || SECTORS.safer;
    const jitter = { escort: -14, frigate: 16, mcm: 8, carrier: -22 }[unit.kind] || 0;
    return { x: sec.x + jitter, y: sec.y + (unit.kind === "carrier" ? -8 : 0) };
  }

  function svgEl(name, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  }

  function drawJobs() {
    const layer = $("job-layer");
    layer.replaceChildren();
    const unit = unitById(state.selected);
    for (const job of JOB_SHAPES) {
      const action = unit ? inferAction(unit, job.id) : null;
      const g = svgEl("g", { class: `job-wrap${action ? " has-job" : ""}` });
      const r = svgEl("rect", {
        class: `job${action ? " is-valid" : ""}`,
        x: job.x,
        y: job.y,
        width: job.w,
        height: job.h,
        rx: 6,
        "data-sector": job.id,
      });
      r.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onJobClick(job.id);
      });
      const label = svgEl("text", {
        class: `job-label${action ? "" : " dim"}`,
        x: job.x + 10,
        y: job.y + 18,
      });
      label.textContent = action ? action.toUpperCase() + " · " + job.label : job.label;
      g.append(r, label);
      layer.append(g);
    }
  }

  function drawThreats() {
    const layer = $("threat-layer");
    layer.replaceChildren();
    for (const mine of state.mines) {
      layer.append(svgEl("circle", { class: "mine", cx: mine.x, cy: mine.y, r: 4.5 }));
    }
    for (const swarm of state.swarms) {
      for (let i = 0; i < 5; i += 1) {
        const ang = (i / 5) * Math.PI * 2;
        layer.append(svgEl("polygon", {
          class: "swarm",
          points: boatPoints(swarm.x + Math.cos(ang) * 10, swarm.y + Math.sin(ang) * 7, 5),
        }));
      }
    }
    for (const nest of state.nests) {
      const unit = unitById(state.selected);
      const valid = unit && inferAction(unit, nest.id) === "strike";
      const g = svgEl("g", { class: `nest${nest.down > 0 ? " is-down" : ""}${valid ? " is-valid" : ""}`, "data-nest": nest.id });
      const mark = svgEl("polygon", {
        class: "mark",
        points: `${nest.x},${nest.y - 10} ${nest.x + 11},${nest.y + 10} ${nest.x - 11},${nest.y + 10}`,
      });
      const cap = svgEl("text", { class: "nest-caption", x: nest.x + 14, y: nest.y + 4 });
      cap.textContent = nest.down > 0 ? "NEST DOWN" : nest.active ? "NEST LIVE" : "NEST QUIET";
      g.append(mark, cap);
      g.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onJobClick(nest.id);
      });
      layer.append(g);
    }
  }

  function boatPoints(x, y, s) {
    return `${x},${y - s} ${x + s * 0.7},${y + s * 0.6} ${x - s * 0.7},${y + s * 0.6}`;
  }

  function drawTankers() {
    const layer = $("tanker-layer");
    layer.replaceChildren();
    const n = Math.min(state.queue, 12);
    for (let i = 0; i < n; i += 1) {
      const col = i % 6;
      const row = Math.floor(i / 6);
      const x = 800 + col * 26;
      const y = 428 + row * 16;
      layer.append(svgEl("rect", {
        class: `tanker-pip${i >= QUEUE_FAIL - 2 ? " is-hit" : ""}`,
        x,
        y,
        width: 20,
        height: 8,
        rx: 1.5,
      }));
    }
    const count = svgEl("text", { class: "job-label", x: 800, y: 418 });
    count.textContent = `QUEUE ${state.queue} / ${QUEUE_FAIL}`;
    layer.append(count);

    const trans = $("transit-layer");
    trans.replaceChildren();
    state.transits.forEach((t, idx) => {
      const x = 820 - t.t * 55;
      const y = 340 + idx * 8;
      trans.append(svgEl("rect", {
        class: `tanker-pip${t.ok ? "" : " is-hit"}`,
        x,
        y,
        width: 22,
        height: 7,
        rx: 1,
        opacity: String(1 - t.t / 10),
      }));
    });
  }

  function hullPoints(kind) {
    if (kind === "carrier") return "-22,-8 26,-8 22,8 -18,8";
    if (kind === "mcm") return "-12,0 -6,-8 10,-7 14,0 8,8 -8,8";
    if (kind === "frigate") return "-14,0 -4,-6 16,-4 14,5 -6,7";
    return "-16,0 -6,-7 18,-5 16,6 -8,8";
  }

  function drawUnits() {
    const layer = $("unit-layer");
    layer.replaceChildren();
    for (const unit of state.units) {
      const p = unitPoint(unit);
      const g = svgEl("g", {
        class: `unit ${unit.kind}${state.selected === unit.id ? " is-selected" : ""}${unit.busy > 0 ? " is-busy" : ""}${unit.hits > 0 ? " is-hurt" : ""}`,
        transform: `translate(${p.x} ${p.y})`,
        "data-unit": unit.id,
      });
      const hull = svgEl("polygon", { class: "hull", points: hullPoints(unit.kind) });
      const name = svgEl("text", { class: "unit-name", x: -16, y: 20 });
      name.textContent = unit.name;
      g.append(hull, name);
      g.addEventListener("click", (ev) => {
        ev.stopPropagation();
        selectUnit(unit.id);
      });
      layer.append(g);
    }
  }

  function unitStatus(unit) {
    if (unit.busy === 99) return "out";
    if (unit.hits >= unit.maxHits) return "lost";
    if (unit.job && unit.job.type === "escort") return "escorting";
    if (unit.job && unit.job.type === "sweep") return `sweep ${unit.job.left}`;
    if (unit.job && unit.job.type === "strike") return "striking";
    if (unit.cooldown > 0) return `cooldown ${unit.cooldown}`;
    if (unit.job && unit.job.type === "hold") return "on station";
    if (unit.hits > 0) return "damaged";
    return "ready";
  }

  function drawRoster() {
    const box = $("roster");
    box.replaceChildren();
    for (const unit of state.units) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = state.selected === unit.id ? "is-selected" : "";
      b.innerHTML = `<span>${unit.name}</span><span class="meta">${unitStatus(unit)}</span>`;
      b.addEventListener("click", () => selectUnit(unit.id));
      box.append(b);
    }
  }

  function drawLog() {
    const ol = $("log");
    ol.replaceChildren();
    for (const row of state.log.slice(0, 40)) {
      const li = document.createElement("li");
      const when = document.createElement("span");
      when.className = "when";
      when.textContent = `Day ${row.day} · ${WATCHES[row.watch]}`;
      li.append(when, document.createTextNode(row.text));
      ol.append(li);
    }
  }

  function drawStatus() {
    const odds = transitOdds();
    const risk = riskWord(odds);
    const q = $("stat-queue");
    q.textContent = `Queue ${state.queue} / ${QUEUE_FAIL}`;
    q.className = state.queue >= 9 ? "hot" : state.queue <= 4 ? "ok" : "";
    const r = $("stat-risk");
    r.textContent = `Lane ${risk.word}`;
    r.className = risk.cls;
    const o = $("stat-odds");
    o.textContent = `Next transit ${Math.round(odds * 100)}%`;
    o.className = odds >= 0.72 ? "ok" : odds < 0.45 ? "hot" : "mid";
    $("stat-streak").textContent = `Open streak ${state.streak} / ${OPEN_STREAK}`;
    const b = $("stat-budget");
    b.textContent = `Budget ${state.budget}`;
    b.className = state.budget <= 12 ? "hot" : "";
    const ready = state.units.filter((u) => u.busy === 0 && u.busy !== 99).length;
    $("stat-units").textContent = `${ready} units ready`;
    $("day-label").textContent = `Day ${state.day}`;
    $("watch-label").textContent = WATCHES[state.watch];

    const unit = unitById(state.selected);
    $("action-hint").textContent = unit
      ? `${unit.name} — pick an action or a job on the map.`
      : "Select a unit, then a job.";
    for (const btn of document.querySelectorAll("[data-action]")) {
      const action = btn.getAttribute("data-action");
      btn.disabled = !unit || !canUnitDo(unit, action);
      btn.classList.toggle("is-on", pendingAction === action);
    }
    $("btn-pause").classList.toggle("is-on", state.speed === 0);
    $("btn-1x").classList.toggle("is-on", state.speed === 1);
    $("btn-2x").classList.toggle("is-on", state.speed === 2);

    const end = $("end-card");
    if (state.over) {
      end.hidden = false;
      $("end-kicker").textContent = state.over.kind === "win" ? "Lane held" : "Failed";
      $("end-title").textContent = state.over.kind === "win" ? "The gulf stays open" : "The gulf is closed";
      $("end-reason").textContent = state.over.reason;
    } else {
      end.hidden = true;
    }
  }

  function render() {
    drawJobs();
    drawThreats();
    drawTankers();
    drawUnits();
    drawRoster();
    drawLog();
    drawStatus();
  }

  function selectUnit(id) {
    state.selected = id;
    pendingAction = null;
    render();
  }

  function onJobClick(target) {
    const unit = unitById(state.selected);
    if (!unit) return;
    const action = inferAction(unit, target);
    if (!action) return;
    issueOrder(unit, action, target);
  }

  function bind() {
    document.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const unit = unitById(state.selected);
        const action = btn.getAttribute("data-action");
        if (!unit || !canUnitDo(unit, action)) return;
        pendingAction = action;
        if (action === "escort") issueOrder(unit, "escort", "holding");
        else render();
      });
    });
    $("btn-pause").addEventListener("click", () => setSpeed(0));
    $("btn-1x").addEventListener("click", () => setSpeed(1));
    $("btn-2x").addEventListener("click", () => setSpeed(2));
    $("btn-again").addEventListener("click", start);
    document.querySelector(".chart").addEventListener("click", () => {
      pendingAction = null;
    });
  }

  function start() {
    stopClock();
    state = newState();
    pendingAction = null;
    log("Holding area is stacked. Tankers are waiting south of the choke.");
    log("Shore nest near Bandar Abbas is live. Lane risk is already up.");
    render();
  }

  bind();
  start();
})();
