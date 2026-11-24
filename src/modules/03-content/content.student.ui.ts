import { Elysia } from 'elysia'
import { moduleBase } from '../../core/defineModule'
import { escapeHtml } from '../../core/pages'

const base = moduleBase(import.meta.dir)

function studentPage(courseId: string, showResources: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Student Learning | C3L</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f6fa; color: #182b45; font: 1rem/1.6 system-ui, sans-serif; }
    main { width: min(100% - 2rem, 56rem); margin-inline: auto; padding-block: 1.5rem 3rem; }
    nav { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; margin-bottom: 1.25rem; }
    a { color: #174db5; text-underline-offset: .2em; }
    header { background: #142b4b; color: #fff; border-radius: 1rem; padding: clamp(1.25rem, 5vw, 2.75rem); }
    header p { margin-bottom: 0; }
    h1, h2, h3 { line-height: 1.2; margin: 0; }
    h1 { font-size: clamp(2rem, 5vw, 3rem); }
    .panel { background: white; border: 1px solid #ced9e7; border-radius: 1rem; margin-top: 1rem; padding: clamp(1rem, 4vw, 2rem); }
    .notice { border-inline-start: 4px solid #174db5; background: #e8f0ff; padding: .75rem 1rem; }
    form { display: flex; flex-wrap: wrap; gap: .75rem; align-items: end; margin-top: 1rem; }
    label { display: block; flex: 1 1 16rem; min-width: 0; font-weight: 600; }
    input, button { font: inherit; border-radius: .4rem; padding: .6rem .75rem; }
    input { display: block; margin-top: .25rem; width: 100%; border: 1px solid #657990; }
    button { background: #174db5; color: white; border: 1px solid #174db5; cursor: pointer; }
    :focus-visible { outline: 3px solid #174db5; outline-offset: 3px; }
    [data-state="error"] { color: #a51b26; }
    #modules { list-style: none; padding: 0; margin: 0; }
    #modules > li { border-top: 1px solid #ced9e7; padding-block: 1rem; overflow-wrap: anywhere; }
    #modules p { margin: .5rem 0 0; white-space: pre-wrap; }
    .module-detail, .resource-detail { color: #52647c; }
    .resources { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; margin-top: 1rem; }
    .resources section { background: #f3f6fa; border: 1px solid #d8e1ee; border-radius: .65rem; padding: .85rem; }
    .resources h4 { margin: 0; }
    .resources ul { margin-block: .5rem 0; padding-inline-start: 1.25rem; }
    .resources li + li { margin-top: .5rem; }
    @media (max-width: 42rem) { .resources { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <nav aria-label="Student learning navigation">
      <a href="${base}">Module 3 home</a>
      <a href="/01-identity-users/docs">Identity sign-in (Swagger)</a>
      <a href="/02-courses">Course Management</a>
    </nav>
    <header>
      <h1>Student Learning</h1>
      <p>${showResources ? 'Browse your course modules, learning units, and materials.' : 'Enter a course ID to request the learning modules available to you.'}</p>
    </header>
    <p class="notice">Protected student access is still in development. Learning units and file downloads are unavailable here.</p>
    <section class="panel" aria-labelledby="course-heading">
      <h2 id="course-heading">Select a course</h2>
      <form id="course-form" method="get" action="${base}/learn">
        <label for="course-id">Course ID
          <input id="course-id" name="courseId" value="${escapeHtml(courseId)}" required>
        </label>
        <button type="submit">${showResources ? 'Refresh Content' : 'Load Content'}</button>
      </form>
      <noscript><p>Enable JavaScript to request course content.</p></noscript>
    </section>
    <section class="panel" aria-labelledby="modules-heading">
      <h2 id="modules-heading">Learning modules</h2>
      <p id="learning-status" role="status" aria-live="polite">${showResources ? 'Select Refresh Content to load the latest course materials.' : 'Enter a course ID and select Load Content.'}</p>
      <ul id="modules" aria-labelledby="modules-heading" aria-busy="false"></ul>
    </section>
  </main>
  <script>
  (() => {
    const courseForm = document.getElementById('course-form');
    const courseInput = document.getElementById('course-id');
    const status = document.getElementById('learning-status');
    const list = document.getElementById('modules');
    const showResources = ${showResources};
    const prompt = showResources ? 'Select Refresh Content to load the latest course materials.' : 'Enter a course ID and select Load Content.';
    const requestError = 'Could not load course content. Please try again.';
    const errors = {
      401: showResources ? 'Sign-in required. Return to your demo courses to sign in again.' : 'Sign-in required. Sign in through Identity, then try again.',
      403: 'Course access denied.',
      404: showResources ? 'This course or module is no longer available. Select Refresh Content to check again.' : 'This course or its protected content endpoint is unavailable.',
      503: 'The course permission service is unavailable. Please try again later.',
    };
    let requestNumber = 0;
    class ContentError extends Error {}

    function showStatus(state, message) {
      status.dataset.state = state;
      status.textContent = message;
      list.setAttribute('aria-busy', String(state === 'loading'));
    }

    function textElement(tag, text, className) {
      const element = document.createElement(tag);
      element.textContent = text;
      if (className) element.className = className;
      return element;
    }

    async function getContent(url) {
      const response = await fetch(url, {
        method: 'GET', credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'error',
      });
      if (!response.ok) throw new ContentError(errors[response.status] ?? requestError);
      return response.json();
    }

    function resourceSection(heading, rows, emptyText, render) {
      const section = document.createElement('section');
      section.append(textElement('h4', heading));
      if (rows.length === 0) {
        section.append(textElement('p', emptyText, 'resource-detail'));
      } else {
        const items = document.createElement('ul');
        for (const row of rows) items.append(render(row));
        section.append(items);
      }
      return section;
    }

    function resourceRow(title, detail) {
      const row = document.createElement('li');
      row.append(textElement('strong', title));
      if (detail) row.append(textElement('p', detail, 'resource-detail'));
      return row;
    }

    async function getResources(url, courseId, module) {
      const moduleUrl = url + '/' + encodeURIComponent(module.id);
      const [unitData, materialData] = await Promise.all([
        getContent(moduleUrl + '/units'),
        getContent(moduleUrl + '/materials'),
      ]);
      const belongsToModule = (row) => row?.courseId === courseId && row.moduleId === module.id;
      const units = unitData?.units;
      const materials = materialData?.materials;
      if (!Array.isArray(units) || units.some((unit) => !belongsToModule(unit) || typeof unit.title !== 'string') ||
          !Array.isArray(materials) || materials.some((material) => !belongsToModule(material) || typeof material.filename !== 'string')) {
        throw new ContentError('The server returned invalid learning resources. Select Refresh Content to try again.');
      }
      return { units, materials };
    }

    const moduleWeek = (module) => Number.isSafeInteger(module.week) && module.week > 0 ? module.week : Infinity;
    const moduleTopic = (module) => typeof module.topic === 'string' ? module.topic.trim() : '';

    function renderModule(module, resources) {
      const item = document.createElement('li');
      item.append(textElement('h3', module.title));
      if (typeof module.description === 'string' && module.description) {
        item.append(textElement('p', module.description));
      }
      if (resources) {
        const week = moduleWeek(module);
        const topic = moduleTopic(module);
        const detail = Number.isFinite(week) ? 'Week ' + week : 'Unscheduled';
        item.append(textElement('p', topic ? detail + ' · ' + topic : detail, 'module-detail'));
        const sections = document.createElement('div');
        sections.className = 'resources';
        sections.append(resourceSection('Learning Units', resources.units, 'No learning units yet.',
          (unit) => resourceRow(unit.title, typeof unit.description === 'string' ? unit.description : '')));
        sections.append(resourceSection('Learning Materials', resources.materials, 'No learning materials available.',
          (material) => resourceRow(material.filename, [
            typeof material.mimeType === 'string' ? material.mimeType : '',
            Number.isSafeInteger(material.size) && material.size >= 0 ? material.size.toLocaleString() + ' bytes' : '',
          ].filter(Boolean).join(' · '))));
        item.append(sections);
      }
      list.append(item);
    }

    async function loadContent() {
      const currentRequest = ++requestNumber;
      list.replaceChildren();
      const courseId = courseInput.value.trim();
      // Dot segments are normalized by the browser before a request is sent.
      if (!courseId || courseId === '.' || courseId === '..') {
        showStatus('error', 'Enter a valid course ID.');
        return;
      }
      showStatus('loading', 'Loading course content…');
      try {
        const url = '${base}/api/courses/' + encodeURIComponent(courseId) + '/student/modules';
        const data = await getContent(url);
        if (currentRequest !== requestNumber) return;
        if (!Array.isArray(data?.modules) || data.modules.some((module) => typeof module?.title !== 'string')) {
          showStatus('error', 'The server returned an invalid module list.');
          return;
        }
        const modules = data.modules.filter((module) => module.published === true && module.visibility === 'visible');
        if (showResources) {
          if (modules.some((module) => module.courseId !== courseId || typeof module.id !== 'string' ||
              !module.id.trim() || module.id === '.' || module.id === '..')) {
            throw new ContentError('The server returned an invalid module list.');
          }
          modules.sort((a, b) => (moduleWeek(a) - moduleWeek(b)) || moduleTopic(a).localeCompare(moduleTopic(b)));
          // Commit one complete view only after every protected request succeeds.
          const resources = await Promise.all(modules.map((module) => getResources(url, courseId, module)));
          if (currentRequest !== requestNumber) return;
          modules.forEach((module, index) => renderModule(module, resources[index]));
        } else {
          for (const module of modules) renderModule(module);
        }
        showStatus(modules.length ? 'success' : 'empty', modules.length
          ? 'Loaded ' + modules.length + (modules.length === 1 ? ' learning module.' : ' learning modules.')
          : 'No learning modules are available for this course.');
      } catch (error) {
        if (currentRequest === requestNumber) {
          list.replaceChildren();
          showStatus('error', error instanceof ContentError ? error.message : requestError);
        }
      }
    }

    courseForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void loadContent();
    });
    courseInput.addEventListener('input', () => {
      ++requestNumber;
      list.replaceChildren();
      showStatus('idle', prompt);
    });
    if (showResources) {
      window.addEventListener('pagehide', () => {
        ++requestNumber;
        list.replaceChildren();
        showStatus('idle', prompt);
      });
      window.addEventListener('pageshow', (event) => {
        if (event.persisted) void loadContent();
      });
    }
    if (courseInput.value.trim()) void loadContent();
  })();
  </script>
</body>
</html>`
}

export function createStudentUiRoutes({ showResources = false } = {}) {
  return new Elysia().get('/learn', ({ query, set }) => {
    set.headers['content-type'] = 'text/html; charset=utf-8'
    return studentPage(typeof query.courseId === 'string' ? query.courseId : '', showResources)
  })
}

export const studentUiRoutes = createStudentUiRoutes()
