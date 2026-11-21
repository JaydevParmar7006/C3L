// MODULE 3: Content Management
//
// Scope from the project brief:
//   - Create modules/units
//   - Upload learning materials
//   - Organize content by week or topic
//   - Content publishing
//   - Content visibility controls
//
// HOW TO ADD A PAGE TO THE ROUTER (basic demo):
//   1. Find the router at the bottom of this file.
//   2. Copy the  .get('/hello', ...)  line.
//   3. Change the address ('/hello') and the HTML it returns.
//   4. Save. Your new page is at  http://localhost:3000/03-content/<your-address>
import { Elysia } from 'elysia'
import { defineModule, moduleBase } from '../../core/defineModule'
import { studentUiRoutes } from './content.student.ui'
import { contentUiRoutes } from './content.ui'
import { moduleCreateRoutes } from './module.create.routes'
import { moduleListRoutes } from './module.list.routes'
import { moduleOrganizeRoutes } from './module.organize.routes'
import { createModuleAccessRoutes } from './module.access.routes'
import { createMaterialUploadRoutes } from './material.upload.routes'

const base = moduleBase(import.meta.dir)

export default defineModule({
  name: 'Module 3: Content Management',
  description: 'Units, learning materials, publishing',

  router: new Elysia()
    .use(moduleCreateRoutes)
    .use(moduleListRoutes)
    .use(moduleOrganizeRoutes)
    .use(contentUiRoutes)
    .use(studentUiRoutes)
    // Sprint 2: Publishing and visibility routes.
    // Deny mutations until trusted instructor authorization is integrated.
    .use(createModuleAccessRoutes())
    // Uploads also deny by default without trusted course authorization.
    .use(createMaterialUploadRoutes())
    // Front page of this module. The button on the home page opens it.
    .get(
      '/',
      () => `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Module 3: Content Management | C3L</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f6fa; color: #182b45; font: 1rem/1.6 system-ui, sans-serif; }
    .container { width: min(100% - 2rem, 68rem); margin-inline: auto; }
    .site-header { background: #fff; border-bottom: 1px solid #ced9e7; }
    nav { display: flex; align-items: center; flex-wrap: wrap; gap: .25rem 1.5rem; padding-block: .75rem; }
    nav a { display: inline-block; padding-block: .5rem; }
    .brand { font-weight: 750; }
    a { color: #174db5; text-underline-offset: .2em; }
    a:focus-visible { outline: 3px solid #174db5; outline-offset: 4px; }
    main { padding-block: clamp(1.75rem, 6vw, 4.5rem); }
    .overview { background: #142b4b; color: #fff; border-radius: 1rem; padding: clamp(1.5rem, 5vw, 3.5rem); }
    h1, h2 { line-height: 1.15; margin: 0; }
    h1 { font-size: clamp(2rem, 5vw, 3.5rem); max-width: 22ch; }
    h2 { font-size: 1.5rem; }
    p { margin: .75rem 0 0; }
    .overview p { color: #e0eafb; max-width: 58ch; }
    .workspaces { display: grid; gap: 1rem; margin-top: 1rem; }
    .card { display: flex; flex-direction: column; align-items: flex-start; background: #fff; border: 1px solid #ced9e7; border-radius: 1rem; padding: clamp(1.25rem, 4vw, 2rem); }
    .card p { color: #465a74; }
    .card .status { color: #182b45; }
    .action { display: inline-block; margin-top: 1.25rem; background: #174db5; color: #fff; border-radius: .5rem; padding: .65rem 1rem; font-weight: 650; }
    .action:hover { background: #123d90; }
    .demo { margin-top: 1.5rem; }
    @media (min-width: 46rem) { .workspaces { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  </style>
</head>
<body>
  <header class="site-header">
    <nav class="container" aria-label="C3L navigation">
      <a class="brand" href="/">C3L home</a>
      <a href="/01-identity-users">Module 1 · Identity &amp; Users</a>
      <a href="/02-courses">Module 2 · Courses</a>
    </nav>
  </header>
  <main class="container">
    <header class="overview">
      <h1>Module 3: Content Management</h1>
      <p>Organize learning units and materials by week or topic, and manage when course content becomes visible to students.</p>
    </header>
    <div class="workspaces">
      <section class="card" aria-labelledby="instructor-heading">
        <h2 id="instructor-heading">Instructor Workspace</h2>
        <p>Create and browse learning modules, or filter them by week and topic.</p>
        <p class="status"><strong>Sprint-2 prototype.</strong> This workspace opens without sign-in.</p>
        <a class="action" href="${base}/manage">Manage learning modules</a>
      </section>
      <section class="card" aria-labelledby="student-heading">
        <h2 id="student-heading">Student Learning</h2>
        <p>This space will give enrolled students access to course materials made available to them.</p>
        <p class="status"><strong>Protected student access is still in development.</strong></p>
        <a class="action" href="${base}/learn">Open Student Learning</a>
      </section>
    </div>
    <p class="demo"><a href="${base}/hello">Demo page</a></p>
  </main>
</body>
</html>
      `,
    )
    // DEMO: this one line is all it takes to add a page.
    .get('/hello', () => `<h1>Hello from Module 3</h1><a href="${base}">Back</a>`),
})
