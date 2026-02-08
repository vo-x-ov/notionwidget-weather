// ---- CONFIG ----
const DEFAULT_LAT = 41.8781;   // Chicago
const DEFAULT_LON = -87.6298;
const DEFAULT_LABEL = "Chicago";

const STORAGE_KEY = "nw_location_v1";

// ---- Helpers ----
function qs(key){
  const url = new URL(window.location.href);
  return url.searchParams.get(key);
}

function fmtTime(){
  const d = new Date();
  return d.toLocaleString(undefined, { weekday:"short", hour:"numeric", minute:"2-digit" });
}

function codeToSummary(code){
  const map = new Map([
    [0, "Clear"],
    [1, "Mostly clear"], [2, "Partly cloudy"], [3, "Overcast"],
    [45, "Fog"], [48, "Rime fog"],
    [51, "Light drizzle"], [53, "Drizzle"], [55, "Heavy drizzle"],
    [61, "Light rain"], [63, "Rain"], [65, "Heavy rain"],
    [71, "Light snow"], [73, "Snow"], [75, "Heavy snow"],
    [80, "Rain showers"], [81, "Rain showers"], [82, "Violent showers"],
    [95, "Thunderstorm"], [96, "Thunderstorm + hail"], [99, "Thunderstorm + hail"],
  ]);
  return map.get(code) ?? `Weather (${code})`;
}

function elementFor(summary){
  const s = summary.toLowerCase();

  if (s.includes("rain") || s.includes("drizzle") || s.includes("snow") || s.includes("thunder") || s.includes("showers")){
    return { label: "💧 Water", cue: "Release, cleanse, soften. Small ritual: rinse hands + 3 slow breaths." };
  }
  if (s.includes("fog") || s.includes("wind")){
    return { label: "🌬 Air", cue: "Clarify, communicate, reframe. Small ritual: 60s breath focus + jot 1 insight." };
  }
  if (s.includes("clear")){
    return { label: "🔥 Fire", cue: "Initiate, create, move. Small ritual: light a candle + name today’s intention." };
  }
  return { label: "🌱 Earth", cue: "Stabilize, tend, ground. Small ritual: tidy one surface + feel your feet." };
}

function safeParse(json){
  try { return JSON.parse(json); } catch { return null; }
}

function loadSavedLocation(){
  const raw = localStorage.getItem(STORAGE_KEY);
  const v = raw ? safeParse(raw) : null;
  if (v && typeof v.lat === "number" && typeof v.lon === "number" && typeof v.label === "string") return v;
  return null;
}

function saveLocation(loc){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
}

function setHeader(label){
  document.getElementById("location").textContent = label;
  document.getElementById("time").textContent = fmtTime();
}

// ---- Geocoding ----
async function geocodeSearch(query){
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "8");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

function locLabel(r){
  const parts = [r.name];
  if (r.admin1) parts.push(r.admin1);
  if (r.country_code) parts.push(r.country_code.toUpperCase());
  return parts.join(", ");
}

async function resolveInitialLocation(){
  // 1) URL coords (power user)
  const latParam = qs("lat");
  const lonParam = qs("lon");
  const labelParam = qs("label");
  if (latParam && lonParam && !Number.isNaN(Number(latParam)) && !Number.isNaN(Number(lonParam))){
    return { lat: Number(latParam), lon: Number(lonParam), label: labelParam ?? "Weather" };
  }

  // 2) URL city (optional)
  const city = qs("city");
  if (city){
    const results = await geocodeSearch(city);
    if (results.length){
      const r = results[0];
      return { lat: r.latitude, lon: r.longitude, label: locLabel(r) };
    }
  }

  // 3) Saved selection
  const saved = loadSavedLocation();
  if (saved) return saved;

  // 4) fallback
  return { lat: DEFAULT_LAT, lon: DEFAULT_LON, label: DEFAULT_LABEL };
}

// ---- Weather fetch/render ----
async function fetchWeather(lat, lon){
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error("Weather fetch failed");
  return await res.json();
}

function renderWeather(data){
  const cur = data.current;
  const daily = data.daily;

  const summary = codeToSummary(cur.weather_code);
  const element = elementFor(summary);

  document.getElementById("temp").textContent = Math.round(cur.temperature_2m);
  document.getElementById("summary").textContent = summary;
  document.getElementById("hilow").textContent =
    `H: ${Math.round(daily.temperature_2m_max[0])}°  L: ${Math.round(daily.temperature_2m_min[0])}°`;

  document.getElementById("precip").textContent = `${(cur.precipitation ?? 0).toFixed(2)} in`;
  document.getElementById("wind").textContent = `${Math.round(cur.wind_speed_10m)} mph`;
  document.getElementById("humidity").textContent = `${Math.round(cur.relative_humidity_2m)}%`;
  document.getElementById("feels").textContent = `${Math.round(cur.apparent_temperature)}°`;

  document.getElementById("elementBadge").textContent = element.label;

  // Optional ritual cue: toggle with ?cue=0
  const cueOn = (qs("cue") ?? "1") !== "0";
  document.getElementById("ritualCue").textContent = cueOn ? element.cue : "";
}

async function loadAndRender(loc){
  setHeader(loc.label);
  const data = await fetchWeather(loc.lat, loc.lon);
  renderWeather(data);
}

// ---- Picker UI ----
function setupPicker(){
  const input = document.getElementById("cityInput");
  const box = document.getElementById("suggestions");
  let debounceTimer = null;

  function hide(){
    box.hidden = true;
    box.innerHTML = "";
  }

  function show(items, query){
    box.innerHTML = "";

    if (!items || items.length === 0){
      const empty = document.createElement("div");
      empty.className = "suggestion";
      empty.style.cursor = "default";
      empty.innerHTML = `<span>No matches for “${query}”</span><small>try another</small>`;
      box.appendChild(empty);
      box.hidden = false;
      return;
    }

    items.forEach((r) => {
      const div = document.createElement("div");
      div.className = "suggestion";
      div.innerHTML = `<span>${r.name}${r.admin1 ? ", " + r.admin1 : ""}</span><small>${(r.country_code ?? "").toUpperCase()}</small>`;
      div.addEventListener("click", async () => {
        const loc = { lat: r.latitude, lon: r.longitude, label: locLabel(r) };
        saveLocation(loc);
        input.value = "";
        hide();
        await loadAndRender(loc);
      });
      box.appendChild(div);
    });

    box.hidden = false;
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (debounceTimer) clearTimeout(debounceTimer);

    if (q.length < 2) { hide(); return; }

    debounceTimer = setTimeout(async () => {
      const results = await geocodeSearch(q);
      show(results, q);
    }, 250);
  });

  // Escape closes
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });

  // Clicking outside the picker closes suggestions
  document.addEventListener("click", (e) => {
    const picker = e.target.closest(".picker");
    if (!picker) hide();
  });
}

// ---- Boot ----
(async function run(){
  try{
    setupPicker();
    const initial = await resolveInitialLocation();
    await loadAndRender(initial);
  } catch (err){
    document.getElementById("location").textContent = "Weather unavailable";
    document.getElementById("summary").textContent = "Check connection";
    console.error(err);
  }
})();
