// ---- CONFIG ----
// Fallback if no location params are provided:
const DEFAULT_LAT = 41.8781;   // Chicago
const DEFAULT_LON = -87.6298;
const DEFAULT_LABEL = "Chicago";

// ---- Helpers ----
function qs(key){
  const url = new URL(window.location.href);
  return url.searchParams.get(key);
}

function fmtTime(){
  const d = new Date();
  return d.toLocaleString(undefined, { weekday:"short", hour:"numeric", minute:"2-digit" });
}

// Open-Meteo weather code → label
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

// Element mapping (your Layer 3)
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

async function geocodeCity(city, region, country){
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  if (country) url.searchParams.set("country", country);
  // Open-Meteo geocoding doesn’t have a strict “region” param, but we can bias results:
  // We'll keep region for labeling and (if you want later) could do more filtering.

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();

  if (!data.results || data.results.length === 0) {
    throw new Error("No geocoding results");
  }

  const r = data.results[0];
  const labelParts = [r.name];
  if (region) labelParts.push(region);
  else if (r.admin1) labelParts.push(r.admin1);
  if (country || r.country_code) labelParts.push((country ?? r.country_code).toUpperCase());

  return {
    lat: r.latitude,
    lon: r.longitude,
    label: labelParts.join(", ")
  };
}

async function resolveLocation(){
  // Prefer explicit coordinates
  const latParam = qs("lat");
  const lonParam = qs("lon");
  const labelParam = qs("label");

  if (latParam && lonParam && !Number.isNaN(Number(latParam)) && !Number.isNaN(Number(lonParam))) {
    return {
      lat: Number(latParam),
      lon: Number(lonParam),
      label: labelParam ?? "Weather"
    };
  }

  // Otherwise allow city-based location
  const city = qs("city");
  const region = qs("region");   // e.g. TX, IL
  const country = qs("country"); // e.g. US, GB

  if (city) {
    return await geocodeCity(city, region, country);
  }

  // Fallback
  return { lat: DEFAULT_LAT, lon: DEFAULT_LON, label: DEFAULT_LABEL };
}

// ---- Main ----
async function run(){
  const { lat, lon, label } = await resolveLocation();

  document.getElementById("location").textContent = label;
  document.getElementById("time").textContent = fmtTime();

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
  const data = await res.json();

  const cur = data.current;
  const daily = data.daily;

  const summary = codeToSummary(cur.weather_code);
  const element = elementFor(summary);

  document.getElementById("temp").textContent = Math.round(cur.temperature_2m);
  document.getElementById("summary").textContent = summary;
  document.getElementById("hilow").textContent =
    `H: ${Math.round(daily.temperature_2m_max[0])}°  L: ${Math.round(daily.temperature_2m_min[0])}°`;

  document.getElementById("precip").textContent =
    `${(cur.precipitation ?? 0).toFixed(2)} in`;

  document.getElementById("wind").textContent =
    `${Math.round(cur.wind_speed_10m)} mph`;

  document.getElementById("humidity").textContent =
    `${Math.round(cur.relative_humidity_2m)}%`;

  document.getElementById("feels").textContent =
    `${Math.round(cur.apparent_temperature)}°`;

  document.getElementById("elementBadge").textContent = element.label;

  // Optional ritual cue: toggle with ?cue=0
  const cueOn = (qs("cue") ?? "1") !== "0";
  document.getElementById("ritualCue").textContent = cueOn ? element.cue : "";
}

run().catch(err => {
  document.getElementById("location").textContent = "Weather unavailable";
  document.getElementById("summary").textContent = "Check location params";
  console.error(err);
});
