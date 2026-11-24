import { Elysia } from 'elysia'
import { escapeHtml } from '../../core/pages'
import { MAX_MATERIAL_SIZE } from './material.validation'

function managementPage(courseId: string, showResources: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Module 3 Content Management | C3L</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f6fa; color: #182b45; font: 16px/1.6 system-ui, sans-serif; }
    main { max-width: 1120px; margin: auto; padding: 32px 20px 64px; }
    nav, .actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    a { color: #174db5; } h1 { line-height: 1.2; margin-bottom: 12px; }
    h2 { margin-top: 0; } .lead, .hint { color: #52647c; }
    .layout { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(0, 2fr); gap: 24px; align-items: start; }
    .notice { border-inline-start: 4px solid #174db5; background: #e8f0ff; padding: 12px 16px; }
    .panel { background: white; border: 1px solid #d8e1ee; border-radius: 12px; padding: 24px; margin: 20px 0; }
    .layout .panel { margin: 0; } label { display: block; font-weight: 600; margin-bottom: 16px; }
    input, textarea, button { font: inherit; border-radius: 6px; }
    input, textarea { display: block; width: 100%; padding: 9px 12px; border: 1px solid #8798af; margin-top: 4px; color: inherit; background: white; }
    textarea { resize: vertical; } button { padding: 10px 16px; border: 1px solid #174db5; background: #174db5; color: white; cursor: pointer; }
    button.secondary { background: white; color: #174db5; } button:disabled { opacity: .6; cursor: wait; }
    :focus-visible { outline: 3px solid #e5a328; outline-offset: 3px; }
    .filters { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .filters .actions { grid-column: 1 / -1; } #modules { list-style: none; padding: 0; }
    #modules > li { border-top: 1px solid #d8e1ee; padding: 16px 0; overflow-wrap: anywhere; }
    #modules h3 { margin: 0 0 8px; } #modules p { margin: 6px 0; white-space: pre-wrap; }
    .module-controls { min-inline-size: 0; margin: 12px 0 0; padding: 0; border: 0; }
    .module-controls legend { font-weight: 600; margin-bottom: 8px; }
    .upload-form { margin-top: 16px; }
    .upload-form input { min-width: 0; }
    .module-resources { border-top: 1px solid #d8e1ee; margin-top: 16px; padding-top: 12px; }
    .module-resources h4 { margin: 0; }
    .resource-list { padding-inline-start: 1.25rem; overflow-wrap: anywhere; }
    .resource-list li + li { margin-top: .5rem; }
    .module-resources .feedback:empty { display: none; }
    .feedback { min-height: 1.6em; overflow-wrap: anywhere; } .feedback[data-kind="error"] { color: #a51b26; }
    .feedback[data-kind="success"] { color: #17643b; }
    @media (max-width: 720px) { .layout, .filters { grid-template-columns: 1fr; } main { padding: 24px 14px; } .panel { padding: 18px; } }
  </style>
</head>
<body><main>
  <nav aria-label="Main navigation"><a href="/03-content">Module 3 home</a><a href="/">C3L homepage</a></nav>
  <header><h1>Module 3 Content Management</h1><p class="lead">Create learning modules and organize your course by week or topic.</p></header>
  <p class="notice" id="authorization-notice"><strong>Trusted course authorization required.</strong> Creating, listing, and organizing modules, changing publication or visibility, and uploading materials are currently unavailable while instructor permissions are being integrated.</p>
  <section class="panel" aria-labelledby="course-heading">
    <h2 id="course-heading">Select a course</h2>
    <form id="course-form">
      <label for="course-id">Course ID<input id="course-id" name="courseId" required value="${escapeHtml(courseId)}" placeholder="DEMO-101"></label>
      <button type="submit">Load Modules</button>
    </form>
    <p class="hint">Enter the course ID for the modules you want to manage.</p>
  </section>
  <div class="layout">
    <section class="panel" aria-labelledby="create-heading">
      <h2 id="create-heading">Create a module</h2>
      <form id="create-form">
        <label for="module-title">Title (required)<input id="module-title" name="title" required></label>
        <label for="module-description">Description (optional)<textarea id="module-description" name="description" rows="4"></textarea></label>
        <label for="module-week">Week (optional)<input id="module-week" name="week" type="number" min="1" step="1"></label>
        <label for="module-topic">Topic (optional)<input id="module-topic" name="topic"></label>
        <button id="create-button" type="submit">Create Module</button>
      </form>
      <p id="create-status" class="feedback" role="status" aria-live="polite"></p>
    </section>
    <section class="panel" aria-labelledby="list-heading">
      <h2 id="list-heading">Learning modules</h2>
      <p id="selected-course" class="hint">Choose a course to begin.</p>
      <form id="filter-form" class="filters">
        <label for="filter-week">Filter by week<input id="filter-week" name="week" type="number" min="1" step="1"></label>
        <label for="filter-topic">Filter by topic<input id="filter-topic" name="topic" placeholder="Exact topic match"></label>
        <div class="actions"><button type="submit">Apply Filters</button><button id="clear-filters" class="secondary" type="button">Clear Filters</button></div>
      </form>
      <p id="list-status" class="feedback" role="status" aria-live="polite">Enter a course ID and select Load Modules.</p>
      <ul id="modules" aria-label="Course learning modules"></ul>
      <template id="module-actions">
        <p class="module-state"></p>
        <fieldset class="module-controls" aria-describedby="authorization-notice">
          <legend>Instructor actions</legend>
          <div class="actions">
            <button class="publication secondary" type="button">Publish</button>
            <button class="visibility secondary" type="button">Make visible</button>
          </div>
          ${showResources ? `
          <section class="module-resources">
            <h4>Learning units</h4>
            <ul class="resource-list units-list" aria-label="Learning units"></ul>
            <p class="feedback units-status" role="status"></p>
            <form class="unit-form" aria-label="Add Learning Unit">
              <label>Unit title (required)<input name="title" required></label>
              <label>Unit description (optional)<textarea name="description" rows="2"></textarea></label>
              <button type="submit">Add Learning Unit</button>
            </form>
            <p class="feedback unit-feedback" role="status"></p>
          </section>
          <section class="module-resources">
            <h4>Learning materials</h4>
            <ul class="resource-list materials-list" aria-label="Learning materials"></ul>
            <p class="feedback materials-status" role="status"></p>` : ''}
          <form class="upload-form" enctype="multipart/form-data">
            <label>Learning material
              <input name="file" type="file" required accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,video/mp4,video/webm">
            </label>
            <p class="hint">PDF, DOC, DOCX, MP4 or WebM. Maximum 20 MiB.</p>
            <button type="submit">Upload material</button>
          </form>
          ${showResources ? '</section>' : ''}
        </fieldset>
        <p class="feedback module-feedback" role="status" aria-live="polite"></p>
      </template>
    </section>
  </div>
</main>
<script>
(() => {
  const byId = (id) => document.getElementById(id);
  const courseInput = byId('course-id');
  const list = byId('modules');
  let listRequest = 0;
  let creating = false;

  function feedback(id, message, kind = '') {
    const element = byId(id);
    element.textContent = message;
    element.dataset.kind = kind;
  }
  function courseId() {
    const value = courseInput.value.trim();
    if (!value) throw new Error('Enter a course ID.');
    return value;
  }
  function weekValue(id) {
    const input = byId(id);
    const raw = input.value;
    if (input.validity.badInput) throw new Error('Week must be a positive safe integer.');
    if (raw === '') return undefined;
    const value = Number(raw);
    if (!/^[0-9]+$/.test(raw) || !Number.isSafeInteger(value) || value < 1) {
      throw new Error('Week must be a positive safe integer.');
    }
    return value;
  }
  function apiUrl(id) {
    return '/03-content/api/courses/' + encodeURIComponent(id) + '/modules';
  }
  async function requestJson(url, options) {
    let response;
    try { response = await fetch(url, { ...options, credentials: 'same-origin' }); }
    catch { throw new Error('Could not reach the server. Check your connection and try again.'); }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const fallback = {
        400: 'Check the submitted values and try again.',
        401: 'Sign in and try again.',
        403: 'Instructor authorization required.',
        404: 'The requested module or resource was not found.',
      }[response.status] ?? 'The server could not complete the request. Please try again.';
      const message = typeof data?.error === 'string' && data.error.trim() ? data.error : fallback;
      throw new Error(message + ' (HTTP ' + response.status + ')');
    }
    if (!data) throw new Error('The server returned an unreadable response. Please try again.');
    return data;
  }
  function errorText(error) {
    return error instanceof Error ? error.message : 'Request failed. Please try again.';
  }
  function resourceLoader(item, url, resource, emptyMessage, render) {
    const list = item.querySelector('.' + resource + '-list');
    const status = item.querySelector('.' + resource + '-status');
    let latest = 0;
    return async () => {
      const request = ++latest;
      status.dataset.kind = '';
      status.textContent = 'Loading ' + resource + '…';
      try {
        const data = await requestJson(url + '/' + resource);
        if (!item.isConnected || request !== latest) return;
        if (!Array.isArray(data[resource])) throw new Error('The server returned an invalid resource list.');
        list.replaceChildren(...data[resource].map(render));
        status.textContent = data[resource].length ? '' : emptyMessage;
      } catch (error) {
        if (!item.isConnected || request !== latest) return;
        status.dataset.kind = 'error';
        status.textContent = 'Could not load ' + resource + '. ' + errorText(error);
      }
    };
  }
  function resourceRow(title, detail) {
    const row = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = title;
    row.append(label);
    if (detail) {
      const description = document.createElement('p');
      description.textContent = detail;
      row.append(description);
    }
    return row;
  }
  function addModuleActions(item, id, module) {
    item.append(byId('module-actions').content.cloneNode(true));
    const state = item.querySelector('.module-state');
    const controls = item.querySelector('.module-controls');
    const publication = item.querySelector('.publication');
    const visibility = item.querySelector('.visibility');
    const form = item.querySelector('.upload-form');
    const fileInput = form.elements.namedItem('file');
    const status = item.querySelector('.module-feedback');
    const url = apiUrl(id) + '/' + encodeURIComponent(module.id);

    function updateState() {
      state.textContent = (module.published ? 'Published' : 'Unpublished') + ' · ' +
        (module.visibility === 'visible' ? 'Visible' : 'Hidden');
      publication.textContent = module.published ? 'Unpublish' : 'Publish';
      visibility.textContent = module.visibility === 'visible' ? 'Hide' : 'Make visible';
    }
    async function runAction(trigger, pending, action, feedback = status) {
      if (controls.disabled) return;
      const restoreFocus = item.contains(document.activeElement);
      controls.disabled = true;
      feedback.dataset.kind = '';
      feedback.textContent = pending;
      try {
        feedback.textContent = await action();
        feedback.dataset.kind = 'success';
      } catch (error) {
        feedback.textContent = errorText(error);
        feedback.dataset.kind = 'error';
      } finally {
        controls.disabled = false;
        if (restoreFocus && item.isConnected && document.activeElement === document.body) trigger.focus();
      }
    }
    function changeState(trigger, path, field, value, isValid, message) {
      void runAction(trigger, 'Saving change…', async () => {
        const data = await requestJson(url + '/' + path, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        });
        if (data.module?.id !== module.id || !isValid(data.module[field])) {
          throw new Error('The server did not confirm the module change. Reload the module list to check its status.');
        }
        module[field] = data.module[field];
        updateState();
        if (!item.isConnected && courseInput.value.trim() === id) await loadModules();
        return message;
      });
    }
    publication.addEventListener('click', () => {
      changeState(publication, 'publication', 'published', !module.published,
        (value) => typeof value === 'boolean', 'Publication status updated.');
    });
    visibility.addEventListener('click', () => {
      changeState(visibility, 'visibility', 'visibility', module.visibility === 'visible' ? 'hidden' : 'visible',
        (value) => value === 'visible' || value === 'hidden', 'Visibility updated.');
    });
    let loadMaterials;
    if (${showResources}) {
      const unitForm = item.querySelector('.unit-form');
      const unitTitle = unitForm.elements.namedItem('title');
      const unitDescription = unitForm.elements.namedItem('description');
      const unitFeedback = item.querySelector('.unit-feedback');
      const loadUnits = resourceLoader(item, url, 'units', 'No learning units yet.',
        (unit) => resourceRow(unit.title, unit.description));
      loadMaterials = resourceLoader(item, url, 'materials', 'No learning materials uploaded yet.',
        (material) => resourceRow(material.filename, [
          material.mimeType,
          Number.isFinite(material.size) ? material.size.toLocaleString() + ' bytes' : '',
        ].filter(Boolean).join(' · ')));
      unitForm.addEventListener('submit', (event) => {
        event.preventDefault();
        void runAction(event.submitter ?? unitTitle, 'Adding learning unit…', async () => {
          const title = unitTitle.value.trim();
          if (!title) throw new Error('Enter a learning unit title.');
          const description = unitDescription.value.trim();
          const body = description ? { title, description } : { title };
          const data = await requestJson(url + '/units', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
          });
          if (data.unit?.moduleId !== module.id || typeof data.unit.title !== 'string') {
            throw new Error('The server did not confirm the learning unit.');
          }
          unitForm.reset();
          await loadUnits();
          return 'Learning unit added.';
        }, unitFeedback);
      });
      // Start after the card is attached so late responses for removed cards can be ignored.
      queueMicrotask(() => {
        if (!item.isConnected) return;
        void loadUnits();
        void loadMaterials();
      });
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const file = fileInput.files[0];
      void runAction(event.submitter ?? fileInput, 'Uploading material…', async () => {
        if (!file) throw new Error('Choose a file to upload.');
        if (file.size === 0) throw new Error('Uploaded file cannot be empty.');
        if (file.size > ${MAX_MATERIAL_SIZE}) throw new Error('The file exceeds the 20 MiB limit.');
        const allowedTypes = fileInput.accept.split(',');
        if (!allowedTypes.includes(file.type.toLowerCase())) throw new Error('Unsupported file type.');
        const body = new FormData();
        body.append('file', file);
        const data = await requestJson(url + '/materials', { method: 'POST', body });
        if (data.material?.moduleId !== module.id || typeof data.material.filename !== 'string') {
          throw new Error('The server did not confirm the upload.');
        }
        form.reset();
        await loadMaterials?.();
        return 'Uploaded: ' + data.material.filename;
      });
    });
    updateState();
  }
  function renderModules(modules, id) {
    list.replaceChildren();
    for (const module of modules) {
      const item = document.createElement('li');
      const title = document.createElement('h3');
      title.textContent = module.title;
      item.append(title);
      if (module.description) {
        const description = document.createElement('p');
        description.textContent = module.description;
        item.append(description);
      }
      const details = document.createElement('p');
      details.textContent = 'Week: ' + (module.week ?? 'Unnumbered') + ' • Topic: ' + (module.topic || 'No topic');
      const created = document.createElement('p');
      const date = new Date(module.createdAt);
      created.textContent = 'Created: ' + (Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString());
      item.append(details, created);
      addModuleActions(item, id, module);
      list.append(item);
    }
  }
  async function loadModules() {
    const currentRequest = ++listRequest;
    list.replaceChildren();
    byId('selected-course').textContent = 'Choose a course to begin.';
    try {
      const id = courseId();
      const week = weekValue('filter-week');
      const topic = byId('filter-topic').value.trim();
      const query = new URLSearchParams();
      if (week !== undefined) query.set('week', String(week));
      if (topic) query.set('topic', topic);
      byId('selected-course').textContent = 'Course: ' + id;
      feedback('list-status', 'Loading modules…');
      const data = await requestJson(apiUrl(id) + '/organized?' + query.toString());
      if (currentRequest !== listRequest) return;
      if (!data || !Array.isArray(data.modules)) throw new Error('The server returned an invalid module list.');
      renderModules(data.modules, id);
      feedback('list-status', data.modules.length ? data.modules.length + ' module(s) loaded.' : 'No modules match this course and filters.');
    } catch (error) {
      if (currentRequest === listRequest) {
        list.replaceChildren();
        feedback('list-status', errorText(error), 'error');
      }
    }
  }
  byId('course-form').addEventListener('submit', (event) => {
    event.preventDefault();
    feedback('create-status', '');
    void loadModules();
  });
  byId('filter-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void loadModules();
  });
  byId('clear-filters').addEventListener('click', () => {
    byId('filter-form').reset();
    void loadModules();
  });
  courseInput.addEventListener('input', () => {
    ++listRequest;
    list.replaceChildren();
    byId('selected-course').textContent = 'Choose a course to begin.';
    feedback('list-status', 'Select Load Modules to view this course.');
    feedback('create-status', '');
  });
  byId('create-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (creating) return;
    try {
      const id = courseId();
      const title = byId('module-title').value.trim();
      if (!title) throw new Error('Enter a module title.');
      const week = weekValue('module-week');
      const body = { title };
      const description = byId('module-description').value.trim();
      const topic = byId('module-topic').value.trim();
      if (description) body.description = description;
      if (topic) body.topic = topic;
      if (week !== undefined) body.week = week;
      creating = true;
      byId('create-button').disabled = true;
      feedback('create-status', 'Creating module…');
      await requestJson(apiUrl(id), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      if (courseInput.value.trim() !== id) return;
      byId('create-form').reset();
      feedback('create-status', 'Module created successfully for ' + id + '.', 'success');
      // Refresh the current course; active filters may hide the new module.
      await loadModules();
    } catch (error) {
      feedback('create-status', errorText(error), 'error');
    } finally {
      creating = false;
      byId('create-button').disabled = false;
    }
  });
  if (courseInput.value.trim()) void loadModules();
})();
</script>
</body></html>`
}

export function createContentUiRoutes({ showResources = false } = {}) {
  return new Elysia().get('/manage', ({ request, set }) => {
    const courseId = new URL(request.url).searchParams.get('courseId') ?? ''
    set.headers['content-type'] = 'text/html; charset=utf-8'
    return managementPage(courseId, showResources)
  })
}

export const contentUiRoutes = createContentUiRoutes()
