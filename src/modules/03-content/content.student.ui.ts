import { Elysia } from 'elysia'
import { moduleBase } from '../../core/defineModule'
import { escapeHtml } from '../../core/pages'

const base = moduleBase(import.meta.dir)

function studentPage(courseId: string): string {
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
    #modules li { border-top: 1px solid #ced9e7; padding-block: 1rem; overflow-wrap: anywhere; }
    #modules p { margin: .5rem 0 0; white-space: pre-wrap; }
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
      <p>Enter a course ID to request the learning modules available to you.</p>
    </header>
    <p class="notice">Protected student access is still in development. Learning units and file downloads are unavailable here.</p>
    <section class="panel" aria-labelledby="course-heading">
      <h2 id="course-heading">Select a course</h2>
      <form id="course-form" method="get" action="${base}/learn">
        <label for="course-id">Course ID
          <input id="course-id" name="courseId" value="${escapeHtml(courseId)}" required>
        </label>
        <button type="submit">Load Content</button>
      </form>
      <noscript><p>Enable JavaScript to request course content.</p></noscript>
    </section>
    <section class="panel" aria-labelledby="modules-heading">
      <h2 id="modules-heading">Learning modules</h2>
      <p id="learning-status" role="status" aria-live="polite">Enter a course ID and select Load Content.</p>
      <ul id="modules" aria-labelledby="modules-heading" aria-busy="false"></ul>
    </section>
  </main>
  <script>
  (() => {
    const courseForm = document.getElementById('course-form');
    const courseInput = document.getElementById('course-id');
    const status = document.getElementById('learning-status');
    const list = document.getElementById('modules');
    const prompt = 'Enter a course ID and select Load Content.';
    const requestError = 'Could not load course content. Please try again.';
    const errors = {
      401: 'Sign-in required. Sign in through Identity, then try again.',
      403: 'Course access denied.',
      404: 'This course or its protected content endpoint is unavailable.',
      503: 'The course permission service is unavailable. Please try again later.',
    };
    let requestNumber = 0;

    function showStatus(state, message) {
      status.dataset.state = state;
      status.textContent = message;
      list.setAttribute('aria-busy', String(state === 'loading'));
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
        const response = await fetch('${base}/api/courses/' + encodeURIComponent(courseId) + '/learning', {
          method: 'GET', credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'error',
        });
        if (currentRequest !== requestNumber) return;
        if (!response.ok) {
          showStatus('error', errors[response.status] ?? requestError);
          return;
        }
        const data = await response.json();
        if (currentRequest !== requestNumber) return;
        if (!Array.isArray(data?.modules) || data.modules.some((module) => typeof module?.title !== 'string')) {
          showStatus('error', 'The server returned an invalid module list.');
          return;
        }
        const modules = data.modules.filter((module) => module.published !== false && module.visibility !== 'hidden');
        for (const module of modules) {
          const item = document.createElement('li');
          const title = document.createElement('h3');
          title.textContent = module.title;
          item.append(title);
          if (typeof module.description === 'string' && module.description) {
            const description = document.createElement('p');
            description.textContent = module.description;
            item.append(description);
          }
          list.append(item);
        }
        showStatus(modules.length ? 'success' : 'empty', modules.length
          ? 'Loaded ' + modules.length + (modules.length === 1 ? ' learning module.' : ' learning modules.')
          : 'No learning modules are available for this course.');
      } catch {
        if (currentRequest === requestNumber) {
          list.replaceChildren();
          showStatus('error', requestError);
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
    if (courseInput.value.trim()) void loadContent();
  })();
  </script>
</body>
</html>`
}

export const studentUiRoutes = new Elysia().get('/learn', ({ query, set }) => {
  set.headers['content-type'] = 'text/html; charset=utf-8'
  return studentPage(typeof query.courseId === 'string' ? query.courseId : '')
})
