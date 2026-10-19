/* Archivo Z: cliente SPA para Dragon Ball API. */
const API_BASE = "https://dragonball-api.com/api";
const PAGE_SIZE = 12;
const app = document.querySelector("#app");
const state = {
  cache: new Map(),
  characters: [],
  planets: [],
  characterMeta: null,
  planetMeta: null,
  routeToken: 0,
  filters: { query: "", race: "", affiliation: "", gender: "", sort: "name" },
  page: 1,
  quiz: null
};

const storage = {
  read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch (error) { console.warn(`No se pudo leer ${key} de localStorage.`, error); return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (error) { console.warn(`No se pudo guardar ${key} en localStorage.`, error); }
  },
  favorites() { return this.read("archivoZ.favorites", []); },
  theme() { return this.read("archivoZ.theme", "dark"); }
};

async function apiFetch(path) {
  const url = `${API_BASE}${path}`;
  const memoryValue = state.cache.get(url);
  if (memoryValue) return memoryValue;
  try {
    const stored = sessionStorage.getItem(`archivoZ:${url}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      state.cache.set(url, parsed);
      return parsed;
    }
  } catch (error) {
    console.warn("La caché de sesión no está disponible; se consultará la API.", error);
  }
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`La API respondió con el estado ${response.status}.`);
  const data = await response.json();
  state.cache.set(url, data);
  try { sessionStorage.setItem(`archivoZ:${url}`, JSON.stringify(data)); }
  catch (error) { console.warn("No se pudo guardar la respuesta en caché de sesión.", error); }
  return data;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function imageOrFallback(url, alt, className = "") {
  const safeUrl = escapeHTML(url || "");
  return `<img class="${className}" src="${safeUrl}" alt="${escapeHTML(alt)}" loading="lazy" onerror="this.onerror=null;this.src='';this.alt='Imagen no disponible';this.classList.add('image-missing')">`;
}

function renderLoading(kind = "grid") {
  if (kind === "detail") return `<div class="container page"><div class="loading-state" role="status">Cargando información del universo…</div></div>`;
  return `<div class="container page"><div class="skeleton-grid" aria-label="Cargando"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div></div>`;
}

function renderError(message, retryRoute = currentRoute()) {
  const route = Array.isArray(retryRoute) ? retryRoute.join("/") : retryRoute;
  return `<div class="container page"><div class="error-state" role="alert"><strong>¡Se interrumpió la exploración!</strong><p>${escapeHTML(message || "No pudimos obtener los datos ahora. Inténtalo de nuevo.")}</p><button class="btn btn-small" type="button" data-retry="${escapeHTML(route)}">Reintentar</button></div></div>`;
}

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  return hash ? hash.split("/").filter(Boolean) : ["inicio"];
}

function navigate() {
  const [section, id] = currentRoute();
  const links = document.querySelectorAll("[data-nav]");
  links.forEach(link => link.classList.toggle("active", link.dataset.nav === section));
  closeMenu();
  const token = ++state.routeToken;
  app.innerHTML = renderLoading(section === "personaje" || section === "planeta" ? "detail" : "grid");
  window.scrollTo({ top: 0, behavior: "smooth" });
  const routes = {
    inicio: renderHome,
    personajes: renderCharacters,
    personaje: () => renderCharacterDetail(id),
    planetas: renderPlanets,
    planeta: () => renderPlanetDetail(id),
    favoritos: renderFavorites,
    quiz: renderQuiz
  };
  const action = routes[section] || renderHome;
  Promise.resolve(action()).then(html => {
    if (token === state.routeToken) {
      app.innerHTML = html;
      app.focus({ preventScroll: true });
      updateFavoriteCount();
      if (section === "favoritos") updateCompare();
    }
  }).catch(error => {
    console.error("Error al cargar la vista:", error);
    if (token === state.routeToken) app.innerHTML = renderError(error.message);
  });
}

function breadcrumbs(label, parent = "inicio") {
  const parentText = parent === "personajes" ? "Personajes" : parent === "planetas" ? "Planetas" : "Inicio";
  return `<div class="breadcrumbs"><a href="#/${parent}">${parentText}</a> / ${escapeHTML(label)}</div>`;
}

function characterCard(character) {
  const favorite = storage.favorites().includes(Number(character.id));
  return `<article class="character-card">
    <a class="character-art" href="#/personaje/${encodeURIComponent(character.id)}" aria-label="Ver detalle de ${escapeHTML(character.name)}">${imageOrFallback(character.image, `Ilustración de ${character.name}`)}</a>
    <div class="card-body">
      <div class="card-title-row"><h3><a href="#/personaje/${encodeURIComponent(character.id)}">${escapeHTML(character.name)}</a></h3>
        <button class="favorite-btn ${favorite ? "is-favorite" : ""}" type="button" data-favorite="${Number(character.id)}" aria-label="${favorite ? "Quitar" : "Añadir"} ${escapeHTML(character.name)} ${favorite ? "de" : "a"} favoritos" aria-pressed="${favorite}">${favorite ? "♥" : "♡"}</button></div>
      <div class="tag-row"><span class="tag">${escapeHTML(character.race || "Raza desconocida")}</span><span class="tag">${escapeHTML(character.affiliation || "Sin afiliación")}</span></div>
      <div class="ki-line"><span>Ki base</span><strong>${escapeHTML(character.ki || "Desconocido")}</strong></div>
    </div>
  </article>`;
}

function filteredCharacters(list) {
  const { query, race, affiliation, gender, sort } = state.filters;
  const filtered = list.filter(character =>
    (!query || character.name.toLowerCase().includes(query.toLowerCase())) &&
    (!race || character.race === race) &&
    (!affiliation || character.affiliation === affiliation) &&
    (!gender || character.gender === gender)
  );
  filtered.sort((a, b) => sort === "ki"
    ? parseKi(b.ki) - parseKi(a.ki)
    : a.name.localeCompare(b.name, "es"));
  return filtered;
}

function parseKi(value) {
  const normalized = String(value || "").trim().replace(/,/g, "");
  const match = normalized.match(/^([\d.]+)\s*(.*)$/);
  if (!match) return 0;
  const numberText = match[1];
  const numeric = (numberText.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(numberText)
    ? Number(numberText.replace(/\./g, ""))
    : Number(numberText);
  const suffix = match[2].toLowerCase();
  const scales = {
    thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12,
    quadrillion: 1e15, quintillion: 1e18, sextillion: 1e21,
    septillion: 1e24, octillion: 1e27, nonillion: 1e30,
    decillion: 1e33, billon: 1e12, trillón: 1e12, millón: 1e6,
    mil: 1e3, millones: 1e6
  };
  const multiplier = Object.entries(scales).find(([name]) => suffix.includes(name))?.[1] || 1;
  return Number.isFinite(numeric) ? numeric * multiplier : 0;
}

function selectOptions(values, selected, label) {
  return `<option value="">${label}</option>${values.filter(Boolean).sort().map(value => `<option value="${escapeHTML(value)}" ${selected === value ? "selected" : ""}>${escapeHTML(value)}</option>`).join("")}`;
}

async function loadAllCharacters() {
  if (state.characters.length) return state.characters;
  const first = await apiFetch(`/characters?page=1&limit=100`);
  if (!Array.isArray(first.items)) throw new Error("La respuesta de personajes no tiene el formato esperado.");
  let all = [...first.items];
  const totalPages = Number(first.meta?.totalPages) || 1;
  for (let page = 2; page <= totalPages; page += 1) {
    const result = await apiFetch(`/characters?page=${page}&limit=100`);
    if (!Array.isArray(result.items)) throw new Error("La respuesta paginada de personajes no es válida.");
    all = all.concat(result.items);
  }
  state.characters = all;
  state.characterMeta = first.meta;
  return all;
}

async function loadAllPlanets() {
  if (state.planets.length) return state.planets;
  const first = await apiFetch("/planets?page=1&limit=100");
  if (!Array.isArray(first.items)) throw new Error("La respuesta de planetas no tiene el formato esperado.");
  let all = [...first.items];
  const pages = Number(first.meta?.totalPages) || 1;
  for (let page = 2; page <= pages; page += 1) {
    const result = await apiFetch(`/planets?page=${page}&limit=100`);
    if (!Array.isArray(result.items)) throw new Error("La respuesta paginada de planetas no es válida.");
    all = all.concat(result.items);
  }
  state.planets = all;
  state.planetMeta = first.meta;
  return all;
}

async function renderHome() {
  try {
    const characters = await loadAllCharacters();
    const dailyIndex = Math.floor(Date.now() / 86400000) % characters.length;
    const daily = characters[dailyIndex];
    const visited = storage.read("archivoZ.visited", []);
    return `<div class="page">
      <section class="hero"><div class="hero-content"><div class="hero-copy">
        <span class="eyebrow">Tu archivo del universo Dragon Ball</span>
        <h1>El poder<br><span>no tiene límites</span></h1>
        <p class="hero-description">Personajes legendarios, planetas lejanos y transformaciones que cambiaron la historia. El universo está en tus manos.</p>
        <div class="button-row"><a class="btn kamehameha" href="#/personajes">Explorar personajes <span aria-hidden="true">→</span></a><a class="btn btn-secondary" href="#/quiz">Ponerme a prueba</a></div>
        <div class="quick-links"><a href="#/personajes">Guerreros Z</a><a href="#/planetas">Planetas</a><a href="#/favoritos">Mis favoritos</a></div>
      </div><div class="hero-visual" aria-hidden="true">${imageOrFallback(daily.image, "")}</div></div></section>
      <section class="section"><div class="container"><div class="section-heading"><div><span class="eyebrow">Progreso de exploración</span><h2>Invoca a Shenlong</h2><p>Explora las secciones para reunir las siete esferas.</p></div>
        <div class="dragon-counter" aria-label="${Math.min(visited.length, 7)} de 7 esferas reunidas"><div class="dragon-balls">${Array.from({ length: 7 }, (_, i) => `<span class="dragon-ball ${i < visited.length ? "collected" : ""}" aria-hidden="true">★</span>`).join("")}</div><strong>${Math.min(visited.length, 7)} / 7</strong></div>
      </div><article class="daily-card">${imageOrFallback(daily.image, `Personaje del día: ${daily.name}`)}<div><span class="eyebrow">Guerrero del día</span><h3>${escapeHTML(daily.name)}</h3><p>${escapeHTML(daily.race || "Guerrero")} · ${escapeHTML(daily.affiliation || "Sin afiliación")}</p><p>Ki base: <strong>${escapeHTML(daily.ki || "Desconocido")}</strong></p></div><a class="btn btn-small" href="#/personaje/${daily.id}">Conocer guerrero</a></article></div></section>
      <section class="section" style="padding-top:0"><div class="container"><div class="section-heading"><div><span class="eyebrow">Empieza tu aventura</span><h2>Elige tu camino</h2></div></div><div class="button-row"><a class="btn btn-secondary" href="#/personajes">Ver personajes</a><a class="btn btn-secondary" href="#/planetas">Visitar planetas</a><a class="btn btn-secondary" href="#/favoritos">Abrir favoritos</a><a class="btn btn-secondary" href="#/quiz">Jugar al quiz</a></div></div></section>
    </div>`;
  } catch (error) {
    console.error("No se pudo cargar la portada.", error);
    return renderError(error.message);
  }
}

async function renderCharacters() {
  try {
    const characters = await loadAllCharacters();
    const races = [...new Set(characters.map(item => item.race))];
    const affiliations = [...new Set(characters.map(item => item.affiliation))];
    const genders = [...new Set(characters.map(item => item.gender))];
    const filtered = filteredCharacters(characters);
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    state.page = Math.min(state.page, pageCount);
    const pageItems = filtered.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    return `<div class="page"><div class="container"><header class="page-top">${breadcrumbs("Personajes")}<div class="page-intro"><div><span class="eyebrow">Guerreros y leyendas</span><h1>Personajes</h1></div><p>${characters.length} personajes en el archivo</p></div></header>
      <div class="toolbar" role="search">
        <label class="sr-only" for="character-search">Buscar personaje</label><input id="character-search" class="field search-field" type="search" placeholder="Buscar por nombre…" value="${escapeHTML(state.filters.query)}">
        <label class="sr-only" for="race-filter">Filtrar por raza</label><select class="field" id="race-filter">${selectOptions(races, state.filters.race, "Todas las razas")}</select>
        <label class="sr-only" for="affiliation-filter">Filtrar por afiliación</label><select class="field" id="affiliation-filter">${selectOptions(affiliations, state.filters.affiliation, "Todas las afiliaciones")}</select>
        <label class="sr-only" for="gender-filter">Filtrar por género</label><select class="field" id="gender-filter">${selectOptions(genders, state.filters.gender, "Todos los géneros")}</select>
        <label class="sr-only" for="sort-filter">Ordenar por</label><select class="field" id="sort-filter"><option value="name" ${state.filters.sort === "name" ? "selected" : ""}>Nombre (A–Z)</option><option value="ki" ${state.filters.sort === "ki" ? "selected" : ""}>Ki (mayor primero)</option></select>
      </div>
      <div class="grid-meta"><span>${filtered.length} resultados</span><button class="text-link" type="button" data-clear-filters>Limpiar filtros</button></div>
      ${pageItems.length ? `<div class="grid">${pageItems.map(characterCard).join("")}</div><nav class="pagination" aria-label="Paginación"><button type="button" data-page="${state.page - 1}" ${state.page <= 1 ? "disabled" : ""}>← Anterior</button><span>Página ${state.page} de ${pageCount}</span><button type="button" data-page="${state.page + 1}" ${state.page >= pageCount ? "disabled" : ""}>Siguiente →</button></nav>` : `<div class="empty-state"><span class="empty-icon">⌕</span><h2>Sin resultados</h2><p>Prueba con otros filtros o términos de búsqueda.</p></div>`}
    </div></div>`;
  } catch (error) {
    console.error("No se pudieron cargar los personajes.", error);
    return renderError(error.message);
  }
}

async function renderCharacterDetail(id) {
  try {
    const character = await apiFetch(`/characters/${encodeURIComponent(id)}`);
    if (!character || !character.id) throw new Error("No encontramos ese personaje.");
    const forms = Array.isArray(character.transformations) ? character.transformations : [];
    const planet = character.originPlanet;
    return `<div class="page"><div class="container"><header class="page-top">${breadcrumbs(character.name, "personajes")}</header>
      <div class="detail-layout"><div class="detail-visual" id="detail-visual">${imageOrFallback(character.image, `Ilustración de ${character.name}`, "detail-image")}</div>
      <section class="detail-copy"><span class="eyebrow">${escapeHTML(character.race || "Guerrero")} · ${escapeHTML(character.affiliation || "Sin afiliación")}</span><h1>${escapeHTML(character.name)}</h1>
        <p class="detail-description">${escapeHTML(character.description || "Este guerrero todavía no tiene una descripción disponible.")}</p>
        <div class="stats-grid"><div class="stat-box"><span>Ki base</span><strong>${escapeHTML(character.ki || "Desconocido")}</strong></div><div class="stat-box"><span>Ki máximo</span><strong>${escapeHTML(character.maxKi || "Desconocido")}</strong></div><div class="stat-box"><span>Género</span><strong>${escapeHTML(character.gender || "Desconocido")}</strong></div><div class="stat-box"><span>Afiliación</span><strong>${escapeHTML(character.affiliation || "Desconocida")}</strong></div></div>
        ${planet ? `<div><span class="eyebrow">Planeta de origen</span><p><a class="text-link" href="#/planeta/${planet.id}">${escapeHTML(planet.name)} ${planet.isDestroyed ? "· Destruido" : ""} →</a></p></div>` : ""}
        <button class="favorite-btn ${storage.favorites().includes(Number(character.id)) ? "is-favorite" : ""}" type="button" data-favorite="${Number(character.id)}" aria-label="Cambiar favorito de ${escapeHTML(character.name)}" aria-pressed="${storage.favorites().includes(Number(character.id))}">${storage.favorites().includes(Number(character.id)) ? "♥" : "♡"} Añadir a favoritos</button>
        <section class="transformations"><span class="eyebrow">Línea de poder</span><h2>Transformaciones</h2>
          ${forms.length ? `<div class="transformation-track" aria-label="Transformaciones de ${escapeHTML(character.name)}">${forms.map((form, index) => `<button type="button" class="transformation ${index === 0 ? "selected" : ""}" data-form-index="${index}" data-form-name="${escapeHTML(form.name)}" data-form-image="${escapeHTML(form.image)}"><img src="${escapeHTML(form.image || "")}" alt="${escapeHTML(form.name)}" loading="lazy"><strong>${escapeHTML(form.name)}</strong><small>Ki: ${escapeHTML(form.ki || "Desconocido")}</small></button>`).join("")}</div><p class="muted">Selecciona una forma para activar el aura de poder.</p>` : `<div class="empty-state"><p>No hay transformaciones registradas para este personaje.</p></div>`}
        </section></section></div></div></div>`;
  } catch (error) {
    console.error("No se pudo cargar el detalle del personaje.", error);
    return renderError(error.message);
  }
}

function planetCard(planet) {
  return `<article class="planet-card"><a class="planet-art" href="#/planeta/${planet.id}" aria-label="Ver planeta ${escapeHTML(planet.name)}">${imageOrFallback(planet.image, `Imagen del planeta ${planet.name}`)}</a><div class="card-body">
    <div class="card-title-row"><h3><a href="#/planeta/${planet.id}">${escapeHTML(planet.name)}</a></h3><span class="planet-status ${planet.isDestroyed ? "destroyed" : "alive"}">${planet.isDestroyed ? "● Destruido" : "● Habitable"}</span></div>
    <p>${escapeHTML(planet.description || "Sin descripción disponible.").slice(0, 180)}${(planet.description || "").length > 180 ? "…" : ""}</p><a class="text-link" href="#/planeta/${planet.id}">Explorar planeta →</a></div></article>`;
}

async function renderPlanets() {
  try {
    const planets = await loadAllPlanets();
    return `<div class="page"><div class="container"><header class="page-top">${breadcrumbs("Planetas")}<div class="page-intro"><div><span class="eyebrow">Universos por descubrir</span><h1>Planetas</h1></div><p>${planets.length} destinos registrados</p></div></header>
      ${planets.length ? `<div class="grid">${planets.map(planetCard).join("")}</div>` : `<div class="empty-state"><h2>No hay planetas disponibles</h2><p>Vuelve a intentarlo más tarde.</p></div>`}
    </div></div>`;
  } catch (error) {
    console.error("No se pudieron cargar los planetas.", error);
    return renderError(error.message);
  }
}

async function renderPlanetDetail(id) {
  try {
    const planet = await apiFetch(`/planets/${encodeURIComponent(id)}`);
    if (!planet || !planet.id) throw new Error("No encontramos ese planeta.");
    const residents = Array.isArray(planet.characters) ? planet.characters : [];
    return `<div class="page"><div class="container"><header class="page-top">${breadcrumbs(planet.name, "planetas")}</header>
      <section class="detail-layout"><div class="detail-visual">${imageOrFallback(planet.image, `Imagen del planeta ${planet.name}`)}</div><div class="detail-copy">
        <span class="eyebrow">Atlas intergaláctico</span><h1>${escapeHTML(planet.name)}</h1><span class="planet-status ${planet.isDestroyed ? "destroyed" : "alive"}">${planet.isDestroyed ? "● Planeta destruido" : "● Planeta activo"}</span>
        <p class="detail-description">${escapeHTML(planet.description || "No hay una descripción disponible.")}</p><div class="stats-grid"><div class="stat-box"><span>Estado</span><strong>${planet.isDestroyed ? "Destruido" : "Activo"}</strong></div><div class="stat-box"><span>Habitantes registrados</span><strong>${residents.length}</strong></div></div>
        <section><span class="eyebrow">Población</span><h2>Personajes del planeta</h2>
          ${residents.length ? `<div class="detail-character-list">${residents.map(person => `<a href="#/personaje/${person.id}">${imageOrFallback(person.image, "")}${escapeHTML(person.name)}</a>`).join("")}</div>` : `<div class="empty-state"><p>No hay habitantes registrados para este planeta.</p></div>`}
        </section></div></section></div></div>`;
  } catch (error) {
    console.error("No se pudo cargar el detalle del planeta.", error);
    return renderError(error.message);
  }
}

async function renderFavorites() {
  try {
    const ids = storage.favorites();
    if (!ids.length) return `<div class="page"><div class="container"><header class="page-top">${breadcrumbs("Favoritos")}<span class="eyebrow">Tu equipo soñado</span><h1>Favoritos</h1></header><div class="empty-state"><span class="empty-icon">♡</span><h2>Aún no tienes favoritos</h2><p>Guarda personajes con el corazón y los encontrarás aquí.</p><a class="btn btn-small" href="#/personajes">Explorar personajes</a></div></div></div>`;
    const all = await loadAllCharacters();
    const favoriteCharacters = ids.map(id => all.find(item => Number(item.id) === Number(id))).filter(Boolean);
    return `<div class="page"><div class="container"><header class="page-top">${breadcrumbs("Favoritos")}<span class="eyebrow">Tu equipo soñado</span><h1>Favoritos</h1><p class="muted">${favoriteCharacters.length} guerreros guardados</p></header>
      <section class="compare-panel" aria-label="Comparar personajes"><div class="compare-slot"><div id="compare-image-1"></div><label class="sr-only" for="compare-one">Primer personaje</label><select class="field" id="compare-one" data-compare="0"><option value="">Elige primer personaje</option>${favoriteCharacters.map(person => `<option value="${person.id}">${escapeHTML(person.name)}</option>`).join("")}</select></div>
      <div class="compare-slot"><div id="compare-image-2"></div><label class="sr-only" for="compare-two">Segundo personaje</label><select class="field" id="compare-two" data-compare="1"><option value="">Elige segundo personaje</option>${favoriteCharacters.map(person => `<option value="${person.id}">${escapeHTML(person.name)}</option>`).join("")}</select></div><div class="compare-ki" id="compare-result"><p class="muted">Elige dos personajes para comparar su ki base.</p></div></section>
      <div class="grid">${favoriteCharacters.map(characterCard).join("")}</div></div></div>`;
  } catch (error) {
    console.error("No se pudieron cargar los favoritos.", error);
    return renderError(error.message);
  }
}

function updateCompare() {
  const selectors = [...document.querySelectorAll("[data-compare]")];
  if (selectors.length < 2) return;
  const people = selectors.map(select => state.characters.find(item => Number(item.id) === Number(select.value)));
  const result = document.querySelector("#compare-result");
  const imageTargets = [document.querySelector("#compare-image-1"), document.querySelector("#compare-image-2")];
  imageTargets.forEach((target, index) => { if (target) target.innerHTML = people[index] ? imageOrFallback(people[index].image, people[index].name) : ""; });
  if (!people[0] || !people[1]) {
    result.innerHTML = `<p class="muted">Elige dos personajes para comparar su ki base.</p>`;
    return;
  }
  const max = Math.max(parseKi(people[0].ki), parseKi(people[1].ki), 1);
  result.innerHTML = `<h3>Comparación de ki base</h3>${people.map(person => `<div class="compare-bar"><div class="compare-bar-head"><strong>${escapeHTML(person.name)}</strong><span>${escapeHTML(person.ki || "Desconocido")}</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, parseKi(person.ki) / max * 100)}%"></div></div></div>`).join("")}<p class="muted">Las barras comparan el valor numérico publicado por la API; unidades de ki en formato original.</p>`;
}

function makeQuiz() {
  const people = state.characters;
  if (people.length < 4) throw new Error("No hay suficientes personajes disponibles para generar el quiz.");
  const shuffled = [...people].sort(() => Math.random() - .5).slice(0, 10);
  return { questions: shuffled.map(person => {
    const races = [...new Set(people.map(item => item.race).filter(Boolean))];
    const distractors = races.filter(race => race !== person.race).sort(() => Math.random() - .5).slice(0, 3);
    const options = [person.race, ...distractors].sort(() => Math.random() - .5);
    return { prompt: `¿Qué raza tiene ${person.name}?`, answer: person.race, options, character: person };
  }), index: 0, score: 0, answered: false, done: false };
}

async function renderQuiz() {
  try {
    await loadAllCharacters();
    if (!state.quiz || state.quiz.done) state.quiz = makeQuiz();
    return quizMarkup();
  } catch (error) {
    console.error("No se pudo preparar el quiz.", error);
    return renderError(error.message);
  }
}

function quizMarkup() {
  const quiz = state.quiz;
  if (quiz.done) {
    const ranking = storage.read("archivoZ.quizRanking", []);
    return `<div class="page"><header class="page-top container">${breadcrumbs("Quiz")}<span class="eyebrow">Resultado final</span><h1>¡Buen combate!</h1></header><section class="quiz-shell"><div class="quiz-card quiz-result"><span class="eyebrow">Tu puntuación</span><strong>${quiz.score}/10</strong><p>${quiz.score >= 8 ? "¡Nivel de Super Saiyan! Conoces muy bien este universo." : quiz.score >= 5 ? "¡Buen entrenamiento! Sigue explorando." : "¡Todo gran guerrero empieza entrenando!"}</p><button class="btn" type="button" data-quiz-restart>Jugar de nuevo</button><div class="ranking"><h2>Ranking local</h2>${ranking.length ? `<ol>${ranking.slice(0, 5).map(item => `<li>${escapeHTML(item.name)} — ${item.score}/10</li>`).join("")}</ol>` : `<p class="muted">Todavía no hay puntuaciones guardadas.</p>`}</div></div></section></div>`;
  }
  const question = quiz.questions[quiz.index];
  return `<div class="page"><header class="page-top container">${breadcrumbs("Quiz")}<span class="eyebrow">Desafío de conocimiento</span><h1>¿Cuánto sabes?</h1><p class="muted">10 preguntas generadas a partir de los datos de los personajes.</p></header><section class="quiz-shell"><div class="quiz-card">
    <div class="grid-meta"><span>Pregunta ${quiz.index + 1} de 10</span><span>Puntaje: ${quiz.score}</span></div><div class="quiz-progress" aria-label="Progreso del quiz"><span style="width:${(quiz.index + 1) * 10}%"></span></div>
    <p class="quiz-question">${escapeHTML(question.prompt)}</p><div class="quiz-options">${question.options.map(option => `<button class="quiz-option" type="button" data-quiz-answer="${escapeHTML(option)}" ${quiz.answered ? "disabled" : ""}>${escapeHTML(option)}</button>`).join("")}</div>
    <p class="quiz-feedback" role="status">${quiz.answered ? `Respuesta correcta: ${escapeHTML(question.answer)}.` : "Elige una respuesta para continuar."}</p>${quiz.answered ? `<div class="button-row"><button class="btn btn-small" type="button" data-quiz-next>${quiz.index === 9 ? "Ver resultado" : "Siguiente pregunta →"}</button></div>` : ""}
  </div></section></div>`;
}

async function setRouteAndRender() {
  const route = currentRoute()[0];
  if (route !== storage.read("archivoZ.lastVisitedRoute", "")) {
    const visited = storage.read("archivoZ.visited", []);
    if (!visited.includes(route)) visited.push(route);
    storage.write("archivoZ.visited", visited.slice(0, 7));
  }
  storage.write("archivoZ.lastVisitedRoute", route);
  navigate();
}

function toggleFavorite(id) {
  const favorites = storage.favorites();
  const index = favorites.indexOf(Number(id));
  if (index >= 0) favorites.splice(index, 1);
  else favorites.push(Number(id));
  storage.write("archivoZ.favorites", favorites);
  const [section] = currentRoute();
  if (section === "favoritos" && !favorites.length) navigate();
  else navigate();
}

function updateFavoriteCount() {
  const count = document.querySelector(".nav-favorite-count");
  if (count) count.textContent = String(storage.favorites().length);
}

function closeMenu() {
  const nav = document.querySelector(".main-nav");
  const toggle = document.querySelector(".menu-toggle");
  nav?.classList.remove("open");
  toggle?.setAttribute("aria-expanded", "false");
  toggle?.setAttribute("aria-label", "Abrir menú");
}

function setupTheme() {
  const button = document.querySelector(".theme-toggle");
  const apply = theme => {
    document.body.classList.toggle("light-theme", theme === "light");
    button.setAttribute("aria-label", theme === "light" ? "Cambiar a tema oscuro" : "Cambiar a tema claro");
    button.innerHTML = theme === "light" ? "<span aria-hidden=\"true\">☾</span>" : "<span aria-hidden=\"true\">☼</span>";
  };
  apply(storage.theme());
  button.addEventListener("click", () => {
    const next = document.body.classList.contains("light-theme") ? "dark" : "light";
    storage.write("archivoZ.theme", next);
    apply(next);
  });
}

let searchTimer;
app.addEventListener("input", event => {
  const target = event.target;
  if (target.id === "character-search") {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.query = target.value.trim();
      state.page = 1;
      navigate();
      setTimeout(() => {
        const input = document.querySelector("#character-search");
        input?.focus();
        if (input) input.setSelectionRange(input.value.length, input.value.length);
      }, 0);
    }, 250);
  }
});

app.addEventListener("change", event => {
  const target = event.target;
  if (target.id === "race-filter") state.filters.race = target.value;
  else if (target.id === "affiliation-filter") state.filters.affiliation = target.value;
  else if (target.id === "gender-filter") state.filters.gender = target.value;
  else if (target.id === "sort-filter") state.filters.sort = target.value;
  else if (target.matches("[data-compare]")) { updateCompare(); return; }
  else return;
  state.page = 1;
  navigate();
});

app.addEventListener("click", event => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.matches("[data-favorite]")) { toggleFavorite(target.dataset.favorite); return; }
  if (target.matches("[data-page]")) { state.page = Number(target.dataset.page); navigate(); return; }
  if (target.matches("[data-clear-filters]")) {
    state.filters = { query: "", race: "", affiliation: "", gender: "", sort: "name" };
    state.page = 1; navigate(); return;
  }
  if (target.matches("[data-retry]")) { location.hash = `#/${target.dataset.retry}`; navigate(); return; }
  if (target.matches("[data-form-index]")) {
    const visual = document.querySelector("#detail-visual");
    const image = visual?.querySelector("img");
    if (image && target.dataset.formImage) {
      image.src = target.dataset.formImage;
      image.alt = target.dataset.formName;
      visual.classList.remove("power-up");
      void visual.offsetWidth;
      visual.classList.add("power-up");
      document.querySelectorAll(".transformation").forEach(form => form.classList.toggle("selected", form === target));
    }
    return;
  }
  if (target.matches("[data-quiz-answer]") && state.quiz && !state.quiz.answered) {
    const question = state.quiz.questions[state.quiz.index];
    const answer = target.dataset.quizAnswer;
    state.quiz.answered = true;
    if (answer === question.answer) state.quiz.score += 1;
    document.querySelectorAll("[data-quiz-answer]").forEach(option => {
      option.disabled = true;
      if (option.dataset.quizAnswer === question.answer) option.classList.add("correct");
      else if (option === target) option.classList.add("wrong");
    });
    document.querySelector(".quiz-feedback").textContent = answer === question.answer ? "¡Correcto! ¡Tu ki sube!" : `No exactamente. La respuesta correcta era ${question.answer}.`;
    document.querySelector(".grid-meta span:last-child").textContent = `Puntaje: ${state.quiz.score}`;
    const actions = document.createElement("div");
    actions.className = "button-row";
    actions.innerHTML = `<button class="btn btn-small" type="button" data-quiz-next>${state.quiz.index === 9 ? "Ver resultado" : "Siguiente pregunta →"}</button>`;
    document.querySelector(".quiz-card").append(actions);
    return;
  }
  if (target.matches("[data-quiz-next]")) {
    state.quiz.index += 1;
    state.quiz.answered = false;
    if (state.quiz.index >= 10) {
      state.quiz.done = true;
      const ranking = storage.read("archivoZ.quizRanking", []);
      ranking.push({ name: "Guerrero", score: state.quiz.score, date: new Date().toLocaleDateString("es-NI") });
      ranking.sort((a, b) => b.score - a.score);
      storage.write("archivoZ.quizRanking", ranking.slice(0, 10));
    }
    app.innerHTML = quizMarkup();
    return;
  }
  if (target.matches("[data-quiz-restart]")) { state.quiz = makeQuiz(); app.innerHTML = quizMarkup(); }
});

document.querySelector(".menu-toggle").addEventListener("click", event => {
  const button = event.currentTarget;
  const open = document.querySelector(".main-nav").classList.toggle("open");
  button.setAttribute("aria-expanded", String(open));
  button.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
});
document.querySelector(".back-to-top").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
window.addEventListener("scroll", () => document.querySelector(".back-to-top").classList.toggle("visible", window.scrollY > 450), { passive: true });
window.addEventListener("hashchange", setRouteAndRender);
window.addEventListener("keydown", event => {
  const sequence = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  window.konamiKeys = [...(window.konamiKeys || []), event.key].slice(-sequence.length);
  if (sequence.every((key, index) => window.konamiKeys[index] === key)) {
    document.body.classList.toggle("super-saiyan");
    window.konamiKeys = [];
  }
});
setupTheme();
setRouteAndRender();
