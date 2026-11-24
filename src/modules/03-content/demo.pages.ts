import { demoCourse } from './demo.auth'

export const demoBase = '/03-content'
export const loginPage = `${demoBase}/login`
export const logoutPath = `${demoBase}/logout`
export const instructorPage = `${demoBase}/manage`
export const studentPage = `${demoBase}/learn`
export const demoNotice =
  'Presentation demo. Accounts, authentication, instructor permissions, and course enrollment are simulated.'

export function workspaceUrl(path: string) {
  return `${path}?courseId=${demoCourse.id}`
}

export const logoutForm = `<form method="post" action="${logoutPath}"><button type="submit">Sign out</button></form>`

function demoPage(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | C3L Module 3 Demo</title>
  <style>
    * { box-sizing: border-box }
    body { margin: 0; background: #eef2f8; color: #152a44; font: 1rem/1.55 system-ui,sans-serif }
    main { width: min(100% - 2rem, 34rem); margin: clamp(1.5rem, 8vh, 5rem) auto }
    header { background: #142b4b; color: #fff; border-radius: 1rem; padding: clamp(1.25rem, 5vw, 2rem) }
    header p { margin: 0 0 .5rem; color: #e0eafb }
    h1, h2, h3 { margin: 0; line-height: 1.2 }
    h1 { font-size: clamp(1.75rem, 6vw, 2.5rem) }
    section { background: #fff; border: 1px solid #cdd8e6; border-radius: 1rem; padding: clamp(1.25rem, 5vw, 2rem); margin-top: 1rem }
    label { display: block; font-weight: 600; margin-block: .85rem }
    input { display: block; width: 100%; padding: .6rem; margin-top: .3rem; border: 1px solid #667a95; border-radius: .45rem; font: inherit }
    button, .action { display: inline-block; color: #fff; background: #174db5; padding: .65rem 1rem; border: 0; border-radius: .45rem; font: inherit; font-weight: 650; cursor: pointer }
    .action { margin-top: .5rem }
    :focus-visible { outline: 3px solid #806800; outline-offset: 3px }
    .notice { background: #e7efff; border-inline-start: 4px solid #174db5; padding: .7rem 1rem }
    .error { color: #982333 }
    .signout { margin-top: 1.25rem }
  </style>
</head>
<body><main>
  <header><p>C3L · Module 3 Content Management</p><h1>${title}</h1></header>
  <p class="notice">${demoNotice}</p>
  ${body}
</main></body>
</html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

export function renderLogin(failure?: { message: string; status: number }) {
  return demoPage(
    'Sign in to the demo',
    `<section aria-labelledby="account-heading">
    <h2 id="account-heading">Demo account</h2>
    ${failure ? `<p class="error" role="alert">${failure.message}</p>` : ''}
    <form method="post" action="${loginPage}">
      <label>Username<input name="username" autocomplete="username" required maxlength="32"></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="64"></label>
      <button type="submit">Sign in</button>
    </form>
  </section>`,
    failure?.status,
  )
}

export function renderCourses(role: 'instructor' | 'student', allowed: boolean) {
  const instructor = role === 'instructor'
  const path = instructor ? instructorPage : studentPage
  return demoPage(
    'Your demo courses',
    `<section aria-labelledby="courses-heading">
    <h2 id="courses-heading">${instructor ? 'Instructor assignments' : 'Student enrollments'}</h2>
    ${
      allowed
        ? `<p><strong>${demoCourse.id}</strong> · ${demoCourse.title}</p>
        <a class="action" href="${workspaceUrl(path)}">${instructor ? 'Open Instructor Workspace' : 'Open Student Learning'}</a>`
        : '<p>No demo courses are assigned to this account.</p>'
    }
    <div class="signout">${logoutForm}</div>
  </section>`,
  )
}
