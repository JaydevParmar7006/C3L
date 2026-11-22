import { expect, test } from 'bun:test'
import { createApp } from '../../app'
import type { LearningModule } from './module.model'
import { Elysia } from 'elysia'
import { createModuleAccessRoutes } from './module.access.routes'
import { createMaterialUploadRoutes } from './material.upload.routes'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLearningModule, getLearningModulesByCourse } from './module.service'
import { createInstructorModuleRoutes } from './module.instructor.routes'

function createAuthorizedInstructorTestApp(...courseIds: string[]) {
  return new Elysia().group('/03-content', (scope) =>
    scope.use(createInstructorModuleRoutes((_request, courseId) => courseIds.includes(courseId))),
  )
}

test('issue #22: mounted module creation denies anonymous requests without writing', async () => {
  const app = await createApp()
  const courseId = `issue-22-create-${crypto.randomUUID()}`
  const url = `http://localhost/03-content/api/courses/${courseId}/modules`
  const response = await app.fetch(new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Anonymous creation regression fixture' }),
  }))

  // Report the status and the storage outcome together if either regresses.
  expect({
    status: response.status,
    modules: getLearningModulesByCourse(courseId),
  }).toEqual({
    status: 403,
    modules: [],
  })
  expect(await response.json()).toEqual({ error: 'Instructor authorization required.' })
})

test.each(['modules', 'modules/organized'])(
  'issue #22: mounted GET %s denies anonymous requests without disclosing hidden drafts',
  async (path) => {
    const app = await createApp()
    const courseId = `issue-22-read-${crypto.randomUUID()}`
    const draft = createLearningModule({
      courseId,
      title: `Hidden draft ${courseId}`,
      description: `Unpublished description ${courseId}`,
    })
    expect(draft).toMatchObject({ published: false, visibility: 'hidden' })

    const url = `http://localhost/03-content/api/courses/${courseId}/${path}`
    const response = await app.fetch(new Request(url))
    const body = await response.text()
    const disclosedDetails = [draft.id, draft.title, draft.description].filter(
      (detail) => detail && body.includes(detail),
    )

    expect({ status: response.status, disclosedDetails }).toEqual({
      status: 403,
      disclosedDetails: [],
    })
    expect(JSON.parse(body)).toEqual({ error: 'Instructor authorization required.' })
  },
)

test.each([
  ['denies access', (): boolean => false],
  ['throws', (): never => {
    throw new Error('Private permission lookup error')
  }],
  ['rejects', async (): Promise<boolean> => {
    throw new Error('Private permission lookup error')
  }],
] as const)('instructor router fails closed when its authorizer %s', async (_label, authorizeInstructor) => {
  const courseId = `issue-22-authorizer-${crypto.randomUUID()}`
  const draft = createLearningModule({ courseId, title: 'Internal instructor fixture' })
  const app = new Elysia().group('/03-content', (scope) =>
    scope.use(createInstructorModuleRoutes(authorizeInstructor)),
  )
  const url = `http://localhost/03-content/api/courses/${courseId}/modules`
  const headers = { 'x-user-role': 'instructor', 'x-user-id': 'test-user' }
  for (const request of [
    new Request(url, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Unauthorized module' }),
    }),
    new Request(url, { headers }),
    new Request(`${url}/organized`, { headers }),
  ]) {
    const response = await app.handle(request)
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Instructor authorization required.' })
  }
  expect(getLearningModulesByCourse(courseId)).toEqual([draft])
})

test('mounted Sprint-2 publishing and visibility routes deny unauthorized changes', async () => {
  const app = await createApp()
  const courseId = `mounted-denied-${crypto.randomUUID()}`
  const base = `http://localhost/03-content/api/courses/${courseId}/modules`
  const module = createLearningModule({ courseId, title: 'Protected module' })
  for (const [path, body] of [
    ['publication', { published: true }], ['visibility', { visibility: 'visible' }],
  ] as const) {
    const response = await app.fetch(new Request(`${base}/${module.id}/${path}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-user-role': 'instructor' },
      body: JSON.stringify(body),
    }))
    expect(response.status).toBe(403)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({ error: 'Instructor authorization required.' })
  }
  expect(getLearningModulesByCourse(courseId)).toMatchObject([
    { id: module.id, published: false, visibility: 'hidden' },
  ])

  // No multipart body: authorization must run before upload parsing.
  const uploadDirectory = process.env.C3L_CONTENT_UPLOAD_DIR ?? join(import.meta.dir, '.c3l-content-uploads')
  const files = async () => readdir(uploadDirectory).then((names) => names.sort()).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const beforeFiles = await files()
  const upload = await app.fetch(new Request(`${base}/${module.id}/materials`, {
    method: 'POST', headers: { 'x-user-role': 'instructor' }, body: 'not multipart',
  }))
  expect(upload.status).toBe(403)
  expect(await upload.json()).toEqual({ error: 'Instructor authorization required.' })
  expect(await files()).toEqual(beforeFiles)
})

test('isolated trusted composition permits upload, publication and visibility', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'c3l-composed-'))
  try {
    const courseId = `trusted-${crypto.randomUUID()}`
    const base = `http://localhost/03-content/api/courses/${courseId}/modules`
    const module = createLearningModule({ courseId, title: 'Isolated test module' })
    // Only this test composition supplies trust; production remains deny-all.
    const authorizeInstructor = (_request: Request, requested: string) => requested === courseId
    const app = new Elysia().group('/03-content', (scope) => scope
      .use(createInstructorModuleRoutes())
      .use(createModuleAccessRoutes({ authorizeInstructor }))
      .use(createMaterialUploadRoutes({ authorizeInstructor, uploadDirectory: directory })))
    for (const [path, body] of [
      ['publication', { published: true }], ['visibility', { visibility: 'visible' }],
    ] as const) {
      const response = await app.handle(new Request(`${base}/${module.id}/${path}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }))
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ module: body })
    }
    const form = new FormData()
    form.append('file', new File(['%PDF-test'], 'lecture.pdf', { type: 'application/pdf' }))
    const uploaded = await app.handle(new Request(`${base}/${module.id}/materials`, { method: 'POST', body: form }))
    expect(uploaded.status).toBe(201)
    expect(await uploaded.json()).toMatchObject({ material: { courseId, moduleId: module.id, filename: 'lecture.pdf' } })
    expect(await readdir(directory)).toHaveLength(1)
    const invalid = new FormData()
    invalid.append('file', new File(['bad'], 'bad.exe', { type: 'application/octet-stream' }))
    const rejected = await app.handle(new Request(`${base}/${module.id}/materials`, { method: 'POST', body: invalid }))
    expect(rejected.status).toBe(400)
    expect(await rejected.json()).toEqual({ error: 'Unsupported file type' })
    expect(await readdir(directory)).toHaveLength(1)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('mounted Module 3 homepage links to the prototype and C3L modules', async () => {
  const app = await createApp()
  const home = await app.fetch(new Request('http://localhost/03-content/'))
  expect(home.status).toBe(200)
  expect(home.headers.get('content-type')).toContain('text/html')
  const homepage = await home.text()
  expect(homepage).toContain('<h1>Module 3: Content Management</h1>')
  expect(homepage).toContain('Instructor Workspace')
  expect(homepage).toContain('Sprint-2 prototype')
  expect(homepage).toContain('This workspace opens without sign-in.')
  expect(homepage).toContain('href="/03-content/manage"')
  expect(homepage).toContain('href="/03-content/hello"')
  expect(homepage).toContain('href="/"')
  expect(homepage).toContain('href="/01-identity-users"')
  expect(homepage).toContain('href="/02-courses"')

  const studentCard = homepage.match(/<section[^>]+aria-labelledby="student-heading">([\s\S]*?)<\/section>/)?.[1] ?? ''
  expect(studentCard).toContain('Student Learning')
  expect(studentCard).toContain('Protected student access is still in development.')
  expect(studentCard).toContain('href="/03-content/learn"')

  const management = await app.fetch(new Request('http://localhost/03-content/manage?courseId=DEMO-101'))
  expect(management.status).toBe(200)
  expect(management.headers.get('content-type')).toContain('text/html')
  const html = await management.text()
  expect(html).toContain('Module 3 Content Management')
  expect(html).toContain('value="DEMO-101"')
  expect(html).toContain('id="create-form"')
})

test('authorized organization API filters shared Sprint-1 data and isolates courses', async () => {
  const courseId = `sprint2-${crypto.randomUUID()}`
  const otherCourseId = `sprint2-other-${crypto.randomUUID()}`
  const app = createAuthorizedInstructorTestApp(courseId, otherCourseId)
  const url = (id: string) => `http://localhost/03-content/api/courses/${encodeURIComponent(id)}/modules`
  const post = async (id: string, title: string, week: number, topic: string) => {
    const response = await app.handle(new Request(url(id), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, week, topic }),
    }))
    expect(response.status).toBe(201)
    expect(response.headers.get('content-type')).toContain('application/json')
    return ((await response.json()) as { module: LearningModule }).module
  }
  const match = await post(courseId, 'Both filters', 2, 'Basics')
  const differentWeek = await post(courseId, 'Different week', 1, 'Basics')
  const differentTopic = await post(courseId, 'Different topic', 2, 'Advanced')
  const other = await post(otherCourseId, 'Other course', 2, 'Basics')

  const listed = await app.handle(new Request(url(courseId)))
  expect(listed.status).toBe(200)
  expect(await listed.json()).toEqual({ modules: [match, differentWeek, differentTopic] })

  const query = new URLSearchParams({ week: '2', topic: ' bAsIcS ' })
  const organized = await app.handle(new Request(`${url(courseId)}/organized?${query}`))
  expect(organized.status).toBe(200)
  expect(organized.headers.get('content-type')).toContain('application/json')
  expect(await organized.json()).toEqual({ modules: [match] })

  const otherOrganized = await app.handle(new Request(`${url(otherCourseId)}/organized?${query}`))
  expect(otherOrganized.status).toBe(200)
  expect(await otherOrganized.json()).toEqual({ modules: [other] })

  const invalid = await app.handle(new Request(`${url(courseId)}/organized?week=2abc`))
  expect(invalid.status).toBe(400)
  expect(invalid.headers.get('content-type')).toContain('application/json')
  expect(await invalid.json()).toEqual({ error: 'Week must be a positive safe integer' })
})

test('authorized instructor API supports create then list with course isolation', async () => {
  const courseId = `DEMO-101-${crypto.randomUUID()}`
  const otherCourseId = `DEMO-OTHER-${crypto.randomUUID()}`
  const app = createAuthorizedInstructorTestApp(courseId, otherCourseId)
  const url = (id: string) => `http://localhost/03-content/api/courses/${id}/modules`
  const post = (id: string, title: string) =>
    app.handle(new Request(url(id), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    }))

  const createdResponse = await post(courseId, 'Sprint-1 demonstration')
  expect(createdResponse.status).toBe(201)
  expect(createdResponse.headers.get('content-type')).toContain('application/json')
  const created = (await createdResponse.json()) as { module: LearningModule }
  expect(created.module).toMatchObject({ courseId, title: 'Sprint-1 demonstration' })
  expect(created.module.id).toBeTruthy()

  const otherResponse = await post(otherCourseId, 'Other course')
  expect(otherResponse.status).toBe(201)
  const other = (await otherResponse.json()) as { module: LearningModule }

  const listedResponse = await app.handle(new Request(url(courseId)))
  expect(listedResponse.status).toBe(200)
  expect(listedResponse.headers.get('content-type')).toContain('application/json')
  expect(await listedResponse.json()).toEqual({ modules: [created.module] })

  const otherList = await app.handle(new Request(url(otherCourseId)))
  expect(otherList.status).toBe(200)
  expect(await otherList.json()).toEqual({ modules: [other.module] })

  const invalidResponse = await post(courseId, '   ')
  expect(invalidResponse.status).toBe(400)
  expect(invalidResponse.headers.get('content-type')).toContain('application/json')
  expect(await invalidResponse.json()).toEqual({ error: 'Module title is required' })
  const afterInvalid = await app.handle(new Request(url(courseId)))
  expect(await afterInvalid.json()).toEqual({ modules: [created.module] })
})

test('mounted Module 3 instructor guard leaves public pages and the student API mount unchanged', async () => {
  const app = await createApp()
  for (const [path, text] of [
    ['/03-content', 'Module 3: Content Management'],
    ['/03-content/hello', 'Hello from Module 3'],
    ['/03-content/learn', 'Student Learning'],
  ]) {
    const response = await app.fetch(new Request(`http://localhost${path}`))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain(text)
  }
  const studentApi = await app.fetch(
    new Request('http://localhost/03-content/api/courses/DEMO-101/student/modules'),
  )
  expect(studentApi.status).toBe(404)
})
