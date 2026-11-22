import { describe, expect, test } from 'bun:test'
import { runInNewContext } from 'node:vm'
import { escapeHtml } from '../../core/pages'
import { contentUiRoutes } from './content.ui'

const page = (courseId?: string) => {
  const query = new URLSearchParams()
  if (courseId !== undefined) query.set('courseId', courseId)
  return contentUiRoutes.handle(new Request(`http://localhost/manage?${query}`))
}

describe('Content management page HTML', () => {
  test('GET /manage returns HTTP 200 and HTML', async () => {
    const response = await page()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await response.text()).toContain('<!doctype html>')
  })

  test('renders heading and module/homepage navigation', async () => {
    const html = await (await page()).text()
    expect(html).toContain('<h1>Module 3 Content Management</h1>')
    expect(html).toContain('href="/03-content"')
    expect(html).toContain('href="/"')
  })

  test('prefills an editable course input from the query', async () => {
    const html = await (await page('DEMO-101')).text()
    expect(html).toContain('name="courseId" required value="DEMO-101"')
    expect(html).toContain('Load Modules')
    expect(html).toContain('if (courseInput.value.trim()) void loadModules()')
  })

  test('provides required title and optional description, week and topic fields', async () => {
    const html = await (await page()).text()
    expect(html).toContain('id="create-form"')
    expect(html).toContain('id="module-title" name="title" required')
    expect(html).toContain('id="module-description" name="description"')
    expect(html).toContain('id="module-week" name="week" type="number" min="1" step="1"')
    expect(html).toContain('id="module-topic" name="topic"')
  })

  test('includes course controls, filters and clear action', async () => {
    const html = await (await page()).text()
    for (const id of ['course-form', 'course-id', 'filter-form', 'filter-week', 'filter-topic', 'clear-filters']) {
      expect(html).toContain(`id="${id}"`)
    }
    expect(html).toContain('Clear Filters')
  })

  test('references existing POST and organized GET APIs with safe URL construction', async () => {
    const html = await (await page()).text()
    expect(html).toContain("'/03-content/api/courses/' + encodeURIComponent(id) + '/modules'")
    expect(html).toContain("method: 'POST'")
    expect(html).toContain("'content-type': 'application/json'")
    expect(html).toContain('body: JSON.stringify(body)')
    expect(html).toContain("apiUrl(id) + '/organized?'")
    expect(html).toContain('new URLSearchParams()')
    expect(html).toContain('Number.isSafeInteger(value)')
    expect(html).toContain('if (week !== undefined) body.week = week')
  })

  test.each([
    '"><script>alert(1)</script><input value="',
    "' autofocus onfocus='alert(1)",
    '</script><img src=x onerror=alert(1)>',
    'COURSE&<topic>"\'',
  ])('escapes malicious query value %j without placing it in scripts', async (courseId) => {
    const html = await (await page(courseId)).text()
    expect(html).toContain(`value="${escapeHtml(courseId)}"`)
    expect(html).not.toContain(courseId)
    const script = html.split('<script>')[1]?.split('</script>')[0]
    const baseline = (await (await page()).text()).split('<script>')[1]?.split('</script>')[0]
    expect(script).toBe(baseline)
    expect(html.match(/<script>/g)).toHaveLength(1)
    expect(html).not.toContain('innerHTML')
  })

  test.each([undefined, '', '   '])('supports empty course ID %j with a usable page', async (courseId) => {
    const response = await page(courseId)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('Enter a course ID and select Load Modules.')
    expect(html).toContain('id="course-id"')
    expect(html).toContain('id="create-form"')
  })

  test('includes responsive styles and accessible feedback', async () => {
    const html = await (await page()).text()
    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1"')
    expect(html).toContain('@media (max-width: 720px)')
    expect(html).toContain('grid-template-columns: 1fr')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Loading modules…')
    expect(html).toContain('No modules match this course and filters.')
    expect(html).toContain('Module created successfully')
    expect(html).toContain('title.textContent = module.title')
    expect(html).toContain('description.textContent = module.description')
  })

  test('explains authorization limits and labels the upload form', async () => {
    const html = await (await page()).text()
    expect(html).toContain('Trusted instructor authorization is still being integrated.')
    expect(html).toContain('aria-describedby="authorization-notice"')
    expect(html).toContain('<label>Learning material')
    expect(html).toContain('name="file" type="file" required')
    expect(html).toContain('PDF, DOC, DOCX, MP4 or WebM. Maximum 20 MiB.')
  })
})

// Execute the served script with a minimal DOM and controlled fetch responses.
class TestElement {
  value = ''
  textContent = ''
  disabled = false
  isConnected = true
  validity = { badInput: false }
  dataset: Record<string, string> = {}
  children: TestElement[] = []
  selectors = new Map<string, TestElement>()
  listeners = new Map<string, (event: { preventDefault(): void }) => void>()
  append(...children: TestElement[]) { this.children.push(...children) }
  replaceChildren() { this.children = [] }
  contains() { return false }
  querySelector(selector: string) {
    const element = this.selectors.get(selector) ?? new TestElement()
    this.selectors.set(selector, element)
    return element
  }
  addEventListener(type: string, listener: (event: { preventDefault(): void }) => void) {
    this.listeners.set(type, listener)
  }
  fire(type: string) { this.listeners.get(type)?.({ preventDefault() {} }) }
}

test('management script sends protected requests and displays only confirmed changes', async () => {
  const html = await (await page()).text()
  const script = html.split('<script>')[1]?.split('</script>')[0] ?? ''
  const root = new TestElement()
  const get = (id: string) => root.querySelector(id)
  const file = new File(['%PDF-test'], '<lecture>.pdf', { type: 'application/pdf' })
  const fileInput = { files: [file], accept: 'application/pdf' }
  const uploadForm = Object.assign(new TestElement(), {
    elements: { namedItem: () => fileInput },
    reset: () => { fileInput.files = [] },
  })
  const card = new TestElement()
  card.selectors.set('.upload-form', uploadForm)
  Object.assign(get('module-actions'), { content: { cloneNode: () => new TestElement() } })
  const module = { id: 'unit/one', title: '<Example>', published: false, visibility: 'hidden' }
  const requests: { url: string; options: RequestInit }[] = []
  const responses: Response[] = [Response.json({ modules: [module] })]
  runInNewContext(script, {
    document: { getElementById: get, createElement: (tag: string) => tag === 'li' ? card : new TestElement() },
    URLSearchParams, FormData, Error,
    fetch: (url: string, options: RequestInit) => {
      requests.push({ url, options })
      return responses.shift()
    },
  })
  const settle = () => Bun.sleep(0)
  get('course-id').value = 'COURSE/1'
  get('course-form').fire('submit')
  await settle()
  const state = card.querySelector('.module-state')
  const status = card.querySelector('.module-feedback')
  const publish = card.querySelector('.publication')
  const visibility = card.querySelector('.visibility')
  expect(card.children[0]?.textContent).toBe('<Example>')
  expect(state.textContent).toBe('Unpublished · Hidden')

  const base = '/03-content/api/courses/COURSE%2F1/modules/unit%2Fone'
  responses.push(Response.json({ error: 'Instructor authorization required.' }, { status: 403 }))
  publish.fire('click')
  await settle()
  expect(requests[1]).toEqual({ url: `${base}/publication`, options: {
    credentials: 'same-origin', method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: '{"published":true}',
  } })
  expect(state.textContent).toBe('Unpublished · Hidden')
  expect(status.textContent).toBe('Instructor authorization required. (HTTP 403)')
  expect(status.dataset.kind).toBe('error')

  responses.push(Response.json({ module: { ...module, published: true } }))
  publish.fire('click')
  await settle()
  expect(state.textContent).toBe('Published · Hidden')
  expect(publish.textContent).toBe('Unpublish')

  responses.push(Response.json({ module: { ...module, published: true, visibility: 'visible' } }))
  visibility.fire('click')
  await settle()
  expect(requests[3]?.url).toBe(`${base}/visibility`)
  expect(requests[3]?.options.body).toBe('{"visibility":"visible"}')
  expect(state.textContent).toBe('Published · Visible')
  expect(visibility.textContent).toBe('Hide')

  responses.push(Response.json({ material: { moduleId: module.id, filename: file.name } }, { status: 201 }))
  uploadForm.fire('submit')
  await settle()
  expect(requests[4]?.url).toBe(`${base}/materials`)
  expect(requests[4]?.options.method).toBe('POST')
  expect(requests[4]?.options.credentials).toBe('same-origin')
  expect(requests[4]?.options.headers).toBeUndefined()
  const uploadBody = requests[4]?.options.body
  expect(uploadBody).toBeInstanceOf(FormData)
  expect(uploadBody instanceof FormData && uploadBody.get('file')).toEqual(file)
  expect(status.textContent).toBe('Uploaded: <lecture>.pdf')
  expect(status.dataset.kind).toBe('success')

  for (const [code, message] of [
    [400, 'Check the submitted values'], [401, 'Sign in'],
    [404, 'resource was not found'], [500, 'server could not complete'],
  ] as const) {
    responses.push(new Response('<html>Error</html>', { status: code }))
    visibility.fire('click')
    await settle()
    expect(status.textContent).toContain(message)
    expect(status.textContent).toContain(`HTTP ${code}`)
    expect(state.textContent).toBe('Published · Visible')
  }
})
