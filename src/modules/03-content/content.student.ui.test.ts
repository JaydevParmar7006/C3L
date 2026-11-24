import { expect, test } from 'bun:test'
import { runInNewContext } from 'node:vm'
import { createApp } from '../../app'
import { escapeHtml } from '../../core/pages'
import { createStudentUiRoutes, studentUiRoutes } from './content.student.ui'

const page = (courseId = '') => studentUiRoutes.handle(new Request(
  `http://localhost/learn?${new URLSearchParams({ courseId })}`,
))

test('mounted student learning page provides navigation, course selection and feedback', async () => {
  const app = await createApp()
  const response = await app.fetch(new Request('http://localhost/03-content/learn?courseId=C3L-101'))
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/html')
  const html = await response.text()
  for (const expected of [
    '<h1>Student Learning</h1>', 'href="/03-content"', 'href="/01-identity-users/docs"',
    'href="/02-courses"', 'name="courseId" value="C3L-101"', 'Load Content',
    'role="status"', 'aria-busy="false"', 'Protected student access is still in development.',
  ]) expect(html).toContain(expected)
})

test('course ID is escaped in HTML and kept out of the browser script', async () => {
  const courseId = '"><img src=x onerror=alert(1)></script>&'
  const html = await (await page(courseId)).text()
  expect(html).toContain(`value="${escapeHtml(courseId)}"`)
  expect(html).not.toContain(courseId)
  expect(html.split('<script>')[1]).toBe((await (await page()).text()).split('<script>')[1])
  expect(html).not.toContain('innerHTML')
})

// Run the served browser script against a minimal DOM and controlled HTTP responses.
class TestElement {
  value = ''
  textContent = ''
  dataset: Record<string, string> = {}
  attributes = new Map<string, string>()
  children: TestElement[] = []
  listeners = new Map<string, (event: Event) => void>()
  append(child: TestElement) { this.children.push(child) }
  replaceChildren() { this.children = [] }
  setAttribute(name: string, value: string) { this.attributes.set(name, value) }
  addEventListener(type: string, listener: (event: Event) => void) { this.listeners.set(type, listener) }
  fire(type: string, properties = {}) {
    this.listeners.get(type)?.(Object.assign(new Event(type), properties))
  }
}

async function startPage(fetch: (url: string, options: RequestInit) => Promise<Response>, showResources = false) {
  const response = showResources
    ? await createStudentUiRoutes({ showResources }).handle(new Request('http://localhost/learn'))
    : await page()
  const html = await response.text()
  const script = html.split('<script>')[1]?.split('</script>')[0] ?? ''
  const form = new TestElement()
  const input = new TestElement()
  const status = new TestElement()
  const list = new TestElement()
  const window = new TestElement()
  const elements = new Map([['course-form', form], ['course-id', input], ['learning-status', status], ['modules', list]])
  runInNewContext(script, {
    document: { getElementById: (id: string) => elements.get(id), createElement: () => new TestElement() },
    fetch, window,
  })
  input.value = 'COURSE/1'
  return { form, input, status, list, window }
}

test('loads only the student API and renders confirmed module strings as text', async () => {
  const requests: { url: string; options: RequestInit }[] = []
  let payload: object = { modules: [
    { title: '<img src=x>', description: '<b>Week one</b>', published: true, visibility: 'visible', units: [{ title: 'Unverified unit' }] },
    { title: 'Hidden module', published: true, visibility: 'hidden' },
    { title: 'Unpublished module', published: false, visibility: 'visible' },
    { title: 'Missing publication', visibility: 'visible' },
    { title: 'Missing visibility', published: true },
    { title: 'Non-boolean publication', published: 'true', visibility: 'visible' },
    { title: 'Unknown visibility', published: true, visibility: 'unknown' },
  ] }
  const { form, input, status, list } = await startPage(async (url, options) => {
    requests.push({ url, options })
    return Response.json(payload)
  })
  input.value = 'COURSE/1 ?#%'
  form.fire('submit')
  expect(status.textContent).toBe('Loading course content…')
  expect(list.attributes.get('aria-busy')).toBe('true')
  await Bun.sleep(0)
  expect(requests).toEqual([{ url: '/03-content/api/courses/COURSE%2F1%20%3F%23%25/student/modules', options: {
    method: 'GET', credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'error',
  } }])
  expect(status.textContent).toBe('Loaded 1 learning module.')
  expect(list.attributes.get('aria-busy')).toBe('false')
  expect(list.children).toHaveLength(1)
  expect(list.children[0]?.children.map((child) => child.textContent)).toEqual(['<img src=x>', '<b>Week one</b>'])

  payload = { modules: [] }
  form.fire('submit')
  await Bun.sleep(0)
  expect(status.dataset.state).toBe('empty')
  expect(list.children).toHaveLength(0)
})

test.each([
  [401, 'Sign-in required.'], [403, 'Course access denied.'],
  [404, 'protected content endpoint is unavailable'], [503, 'permission service is unavailable'],
  [500, 'Could not load course content.'],
] as const)('HTTP %i clears previous results and never renders the error body', async (code, message) => {
  const payload = { modules: [{ title: 'Protected module', published: true, visibility: 'visible' }] }
  let responseCode = 200
  let requestCount = 0
  const { form, status, list } = await startPage(async () => {
    requestCount++
    return Response.json(payload, { status: responseCode })
  })
  form.fire('submit')
  await Bun.sleep(0)
  expect(list.children).toHaveLength(1)
  responseCode = code
  form.fire('submit')
  expect(list.children).toHaveLength(0)
  await Bun.sleep(0)
  expect(status.dataset.state).toBe('error')
  expect(status.textContent).toContain(message)
  expect(list.children).toHaveLength(0)
  expect(requestCount).toBe(2)
})

test('editing the course ID discards an in-flight response', async () => {
  const pending = Promise.withResolvers<Response>()
  const { form, input, status, list } = await startPage(() => pending.promise)
  form.fire('submit')
  input.value = 'OTHER'
  input.fire('input')
  pending.resolve(Response.json({ modules: [{ title: 'Previous course', published: true, visibility: 'visible' }] }))
  await Bun.sleep(0)
  expect(status.dataset.state).toBe('idle')
  expect(list.children).toHaveLength(0)
})

const courseId = 'COURSE/1'
const studentApi = '/03-content/api/courses/COURSE%2F1/student/modules'
const visibleModule = { id: 'module/one', courseId, title: '<img src=x onerror=alert(1)>', week: 1,
  topic: '<b>Fieldwork</b>', published: true, visibility: 'visible' }
const unit = { courseId, moduleId: visibleModule.id, title: '<script>alert(1)</script>', description: '<b>Unit notes</b>' }
const material = { courseId, moduleId: visibleModule.id, filename: '<img src=x>.pdf', mimeType: 'application/pdf',
  size: 12, storedFilename: 'internal-file', downloadUrl: 'https://example.invalid/' }

function textIn(element: TestElement): string {
  return [element.textContent, ...element.children.map(textIn)].filter(Boolean).join('\n')
}

test('demo shows protected resources with their parent modules, ordered by week and topic', async () => {
  const requests: string[] = []
  const later = { ...visibleModule, id: 'later', title: 'Later module', week: 2 }
  const sameWeek = { ...visibleModule, id: 'same-week', title: 'Another topic', topic: 'Zoology' }
  const { form, list, status } = await startPage(async (url, options) => {
    requests.push(url)
    expect(options).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' })
    if (url === studentApi) return Response.json({ modules: [
      later, sameWeek, visibleModule,
      { ...visibleModule, id: 'hidden', visibility: 'hidden' },
      { ...visibleModule, id: 'draft', published: false },
    ] })
    const mine = url.startsWith(studentApi + '/module%2Fone/')
    return url.endsWith('/units')
      ? Response.json({ units: mine ? [unit] : [] })
      : Response.json({ materials: mine ? [material] : [] })
  }, true)
  form.fire('submit')
  await Bun.sleep(0)
  expect(status.dataset.state).toBe('success')
  expect(requests).toHaveLength(7)
  expect(requests).toContain(studentApi + '/module%2Fone/units')
  expect(requests).toContain(studentApi + '/module%2Fone/materials')
  expect(requests.join(' ')).not.toMatch(/hidden|draft/)
  expect(list.children.map((item) => item.children[0]?.textContent)).toEqual([
    visibleModule.title, sameWeek.title, later.title,
  ])
  const [first, second] = list.children
  expect(textIn(first)).toContain('Week 1 · <b>Fieldwork</b>')
  expect(textIn(first)).toContain('Learning Units\n' + unit.title + '\n' + unit.description)
  expect(textIn(first)).toContain('Learning Materials\n' + material.filename + '\napplication/pdf · 12 bytes')
  expect(textIn(first)).not.toMatch(/internal-file|example.invalid/)
  expect(textIn(second)).toContain('No learning units yet.')
  expect(textIn(second)).toContain('No learning materials available.')
  expect(textIn(second)).not.toContain(unit.title)
})

test.each([401, 403, 404, 503])('demo clears all protected content when a resource returns HTTP %i', async (code) => {
  let denied = false
  const { form, list, status } = await startPage(async (url) => {
    if (url === studentApi) return Response.json({ modules: [visibleModule] })
    if (url.endsWith('/units')) return Response.json({ units: [unit] })
    return Response.json({ materials: [material], error: 'Do not render this' }, { status: denied ? code : 200 })
  }, true)
  form.fire('submit')
  await Bun.sleep(0)
  expect(list.children).toHaveLength(1)
  denied = true
  form.fire('submit')
  expect(list.children).toHaveLength(0)
  await Bun.sleep(0)
  expect(list.children).toHaveLength(0)
  expect(status.dataset.state).toBe('error')
  expect(status.textContent).not.toContain('Do not render this')
})

test('demo rejects resources for another module and ignores older results after a refresh', async () => {
  const pending = Promise.withResolvers<Response>()
  let loads = 0
  const { form, list, status } = await startPage(async (url) => {
    if (url === studentApi) {
      loads++
      return Response.json({ modules: [visibleModule] })
    }
    if (url.endsWith('/units')) return Response.json({ units: [] })
    return loads === 1 ? pending.promise : Response.json({
      materials: [{ ...material, moduleId: 'different-module' }],
    })
  }, true)
  form.fire('submit')
  await Bun.sleep(0)
  expect(status.dataset.state).toBe('loading')
  form.fire('submit')
  await Bun.sleep(0)
  expect(status.textContent).toContain('invalid learning resources')
  pending.resolve(Response.json({ materials: [material] }))
  await Bun.sleep(0)
  expect(status.dataset.state).toBe('error')
  expect(list.children).toHaveLength(0)
})

test('demo revalidates protected content when restored by browser history', async () => {
  let signedOut = false
  const { form, list, status, window } = await startPage(async (url) => {
    if (signedOut) return Response.json({}, { status: 401 })
    if (url === studentApi) return Response.json({ modules: [visibleModule] })
    if (url.endsWith('/units')) return Response.json({ units: [unit] })
    return Response.json({ materials: [material] })
  }, true)
  form.fire('submit')
  await Bun.sleep(0)
  expect(list.children).toHaveLength(1)
  window.fire('pagehide')
  expect(list.children).toHaveLength(0)
  signedOut = true
  window.fire('pageshow', { persisted: true })
  await Bun.sleep(0)
  expect(status.textContent).toContain('Sign-in required.')
  expect(list.children).toHaveLength(0)
})
