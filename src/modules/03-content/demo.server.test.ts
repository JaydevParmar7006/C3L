import { expect, test } from 'bun:test'
import { mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../../app'
import type { LearningModule } from './module.model'
import { createLearningModule, getLearningModulesByCourse } from './module.service'

const courseId = 'DEMO-101'
const base = '/03-content'
const coursePath = (id: string) => `${base}/api/courses/${id}`
const json = (method: string, body: object): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const forged = {
  'x-user-id': 'claimed-user',
  'x-user-role': 'admin',
  'x-course-permissions': 'all',
}

function client(url: URL, cookie?: string) {
  return (path: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    if (cookie) headers.set('cookie', cookie)
    return fetch(new URL(path, url), { redirect: 'manual', ...init, headers })
  }
}

function login(url: URL, username: string, password = 'C3L-Demo-101', origin = url.origin) {
  return client(url)(`${base}/login`, {
    method: 'POST',
    headers: { origin },
    body: new URLSearchParams({ username, password }),
  })
}

async function signIn(url: URL, username: string) {
  const response = await login(url, username)
  expect(response.status).toBe(303)
  expect(response.headers.get('location')).toBe(base)
  const cookie = response.headers.get('set-cookie') ?? ''
  expect(cookie).toContain('HttpOnly')
  expect(cookie).toContain('SameSite=Strict')
  expect(cookie).toContain('Path=/03-content')
  expect(cookie).toMatch(/^c3l_content_demo_session=[\w-]{43};/)
  return cookie.split(';')[0]
}

async function withTestData(run: (directory: string) => Promise<void>) {
  const root = await realpath(tmpdir())
  const directory = await mkdtemp(join(root, 'c3l-content-demo-test-'))
  try {
    await run(directory)
  } finally {
    expect(await realpath(directory)).toBe(directory)
    await rm(directory, { recursive: true })
  }
}

async function withDemoProcess<T>(directory: string, run: (url: URL) => Promise<T>): Promise<T> {
  const ready = Promise.withResolvers<URL>()
  const script = `
    import { startContentDemo } from './demo.server.ts'
    const demo = startContentDemo(0, ${JSON.stringify(directory)})
    process.send(demo.url.href)
    await Bun.stdin.text()
    await demo.stop()
    process.disconnect()
  `
  const processHandle = Bun.spawn([process.execPath, '--no-env-file', '-e', script], {
    cwd: import.meta.dir,
    env: { ...Bun.env, NODE_ENV: 'test', C3L_CONTENT_DEMO: '1' },
    stdin: 'pipe',
    stderr: 'inherit',
    ipc(message) {
      ready.resolve(new URL(String(message)))
    },
    onExit(_child, code) {
      ready.reject(new Error(`Demo process exited before it was ready (code ${code}).`))
    },
  })
  let result: T
  try {
    result = await run(await ready.promise)
  } finally {
    processHandle.stdin.end()
    await processHandle.exited
  }
  expect(processHandle.exitCode).toBe(0)
  return result
}

test.each([
  ['test', undefined, 'Set C3L_CONTENT_DEMO=1'],
  ['test', '0', 'Set C3L_CONTENT_DEMO=1'],
  ['production', '1', 'cannot run in production'],
])('demo entry point rejects NODE_ENV=%s with opt-in=%s', (mode, optIn, message) => {
  const env: NodeJS.ProcessEnv = { ...Bun.env, NODE_ENV: mode }
  delete env.C3L_CONTENT_DEMO
  if (optIn !== undefined) env.C3L_CONTENT_DEMO = optIn
  const result = Bun.spawnSync([process.execPath, 'run', '--no-env-file', './demo.server.ts'], {
    cwd: import.meta.dir,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  expect(result.exitCode).toBe(1)
  expect(result.stderr.toString()).toContain(message)
})

test('demo login and logout enforce same-origin requests and revoke server sessions', async () => {
  await withTestData((directory) =>
    withDemoProcess(directory, async (url) => {
      const anonymous = client(url)
      const modules = `${coursePath(courseId)}/modules`
      const page = await anonymous(`${base}/login`)
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('Sign in to the demo')
      expect((await anonymous(`${base}/manage`)).headers.get('location')).toBe(`${base}/login`)

      const badLogin = await login(url, 'instructor', 'wrong password')
      expect(badLogin.status).toBe(401)
      expect(badLogin.headers.has('set-cookie')).toBe(false)
      expect(await badLogin.text()).toContain('Incorrect demo username or password.')
      expect(
        (await login(url, 'instructor', 'C3L-Demo-101', 'https://foreign.example')).status,
      ).toBe(403)
      expect(
        (
          await anonymous(`${base}/login`, {
            method: 'POST',
            body: new URLSearchParams({ username: 'instructor', password: 'C3L-Demo-101' }),
          })
        ).status,
      ).toBe(403)

      const instructor = client(url, await signIn(url, 'instructor'))
      const dashboard = await instructor(base)
      expect(dashboard.status).toBe(200)
      const html = await dashboard.text()
      expect(html).toContain('/03-content/manage?courseId=DEMO-101')
      expect(html).not.toContain('/03-content/learn')
      expect((await instructor(modules)).status).toBe(200)

      const logout = `${base}/logout`
      expect(
        (
          await instructor(logout, {
            method: 'POST',
            headers: { origin: 'https://foreign.example' },
          })
        ).status,
      ).toBe(403)
      expect((await instructor(logout, { method: 'POST' })).status).toBe(403)
      expect((await instructor(modules)).status).toBe(200)
      const signedOut = await instructor(logout, {
        method: 'POST',
        headers: { origin: url.origin },
      })
      expect(signedOut.status).toBe(303)
      expect(signedOut.headers.get('location')).toBe(`${base}/login`)
      expect(signedOut.headers.get('set-cookie')).toContain('Max-Age=0')
      expect((await instructor(modules)).status).toBe(403)
    }),
  )
})

test('loopback HTTP demo supports the instructor-to-student workflow in isolated storage', async () => {
  await withTestData((directory) =>
    withDemoProcess(directory, async (url) => {
      expect(url.hostname).toBe('127.0.0.1')
      const instructorCookie = await signIn(url, 'instructor')
      const request = client(url, instructorCookie)
      const asStudent = client(url, await signIn(url, 'student'))
      const unenrolled = client(url, await signIn(url, 'unenrolled'))
      const studentDashboard = await (await asStudent(base)).text()
      expect(studentDashboard).toContain('/03-content/learn?courseId=DEMO-101')
      expect(studentDashboard).not.toContain('/03-content/manage')
      const noCourses = await (await unenrolled(base)).text()
      expect(noCourses).toContain('No demo courses are assigned to this account.')
      expect(noCourses).not.toContain(courseId)
      expect((await asStudent(`${base}/manage`)).status).toBe(403)
      expect((await request(`${base}/learn`)).status).toBe(403)
      expect((await unenrolled(`${base}/learn`)).status).toBe(403)
      for (const [path, requestPage] of [
        ['/manage', request],
        ['/learn', asStudent],
      ] as const) {
        const page = await requestPage(`${base}${path}?courseId=DEMO-101`)
        expect(page.status).toBe(200)
        expect(page.headers.get('content-type')).toContain('text/html')
        const html = await page.text()
        expect(html).toContain(
          'Accounts, authentication, instructor permissions, and course enrollment are simulated.',
        )
        expect(html).toContain('value="DEMO-101"')
        expect(html).not.toContain('OTHER-101')
        if (path === '/manage') expect(html).toContain('aria-label="Add Learning Unit"')
        expect((await requestPage(`${base}${path}?courseId=OTHER-101`)).status).toBe(403)
      }

      const otherLocalAddress = new URL(url)
      otherLocalAddress.hostname = '127.0.0.2'
      await expect(fetch(otherLocalAddress, { proxy: '' })).rejects.toThrow()

      const course = coursePath(courseId)
      const modules = `${course}/modules`
      const studentModules = `${course}/student/modules`
      const anonymous = client(url)
      expect((await anonymous(modules, { headers: forged })).status).toBe(403)
      expect((await anonymous(studentModules, { headers: forged })).status).toBe(401)
      expect((await unenrolled(studentModules)).status).toBe(403)
      expect((await request(studentModules)).status).toBe(403)
      const readStudent = async () => {
        const response = await asStudent(`${course}/student/modules`, { headers: forged })
        expect(response.status).toBe(200)
        return ((await response.json()) as { modules: LearningModule[] }).modules
      }

      const standardFixture = createLearningModule({
        courseId,
        title: 'Standard app storage fixture',
      })
      expect(await (await request(modules)).json()).toEqual({ modules: [] })
      const headers = { ...forged, origin: 'https://foreign.example' }
      expect((await request(modules, { headers })).status).toBe(403)
      expect((await request(modules, { headers: { host: 'foreign.example' } })).status).toBe(403)

      const created = await request(
        modules,
        json('POST', { title: 'Week 2 field notes', week: 2, topic: 'Fieldwork' }),
      )
      expect(created.status).toBe(201)
      const { module } = (await created.json()) as { module: LearningModule }
      expect(module).toMatchObject({ courseId, published: false, visibility: 'hidden' })
      const modulePath = `${modules}/${module.id}`
      const studentModulePath = `${studentModules}/${module.id}`
      expect(await (await request(`${modulePath}/units`)).json()).toEqual({ units: [] })
      expect(await (await request(`${modulePath}/materials`)).json()).toEqual({ materials: [] })
      expect((await anonymous(`${modulePath}/units`, json('POST', { title: 'Unauthorized' }))).status).toBe(403)
      expect((await anonymous(`${modulePath}/materials`)).status).toBe(403)
      const forgeries = { ...forged, 'content-type': 'application/json' }
      for (const [path, init] of [
        [modules, json('POST', { title: 'Unauthorized draft' })],
        [modules, {}],
        [`${modules}/organized`, {}],
        [`${modulePath}/publication`, json('PATCH', { published: true })],
        [`${modulePath}/visibility`, json('PATCH', { visibility: 'visible' })],
        [`${modulePath}/units`, json('POST', { title: 'Unauthorized unit' })],
        [`${modulePath}/units`, {}],
        [`${modulePath}/materials`, { method: 'POST' }],
        [`${modulePath}/materials`, {}],
      ] as const) {
        expect((await asStudent(path, { ...init, headers: forgeries })).status).toBe(403)
      }
      const unitResponse = await request(
        `${modulePath}/units`,
        json('POST', { title: 'Field notes unit' }),
      )
      expect(unitResponse.status).toBe(201)
      const { unit } = (await unitResponse.json()) as { unit: { id: string } }
      expect(await (await request(modules)).json()).toEqual({ modules: [module] })
      for (const query of ['week=2', 'topic=fieldwork']) {
        expect(await (await request(`${modules}/organized?${query}`)).json()).toEqual({
          modules: [module],
        })
      }
      expect(await (await request(`${modules}/organized?week=1`)).json()).toEqual({ modules: [] })

      const other = coursePath('OTHER-101')
      const forgedJson = json('POST', { title: 'Other course' })
      expect(
        (
          await request(`${other}/modules`, {
            ...forgedJson,
            headers: { ...forged, ...forgedJson.headers },
          })
        ).status,
      ).toBe(403)
      expect((await request(`${other}/modules`, { headers: forged })).status).toBe(403)
      expect((await asStudent(`${other}/student/modules`, { headers: forged })).status).toBe(404)
      for (const [operation, init] of [
        ['publication', json('PATCH', { published: true })],
        ['visibility', json('PATCH', { visibility: 'visible' })],
        ['units', json('POST', { title: 'Other course unit' })],
        ['units', { method: 'GET' }],
        ['materials', { method: 'POST' }],
        ['materials', { method: 'GET' }],
      ] as const) {
        expect((await request(`${other}/modules/${module.id}/${operation}`, init)).status).toBe(403)
      }

      const form = new FormData()
      form.append('file', new File(['%PDF-demo'], 'field-notes.pdf', { type: 'application/pdf' }))
      const upload = await request(`${modules}/${module.id}/materials`, {
        method: 'POST',
        body: form,
      })
      expect(upload.status).toBe(201)
      expect(await upload.json()).toMatchObject({
        material: { courseId, moduleId: module.id, filename: 'field-notes.pdf' },
      })
      expect(await readdir(join(directory, 'demo-uploads'))).toHaveLength(1)
      const listedMaterials = await request(`${modulePath}/materials`)
      expect(listedMaterials.status).toBe(200)
      expect(await listedMaterials.json()).toMatchObject({
        materials: [{ filename: 'field-notes.pdf', mimeType: 'application/pdf', size: 9 }],
      })

      const change = async (operation: string, body: object) => {
        const response = await request(`${modules}/${module.id}/${operation}`, json('PATCH', body))
        expect(response.status).toBe(200)
      }
      expect(await readStudent()).toEqual([])
      await change('publication', { published: true })
      expect(await readStudent()).toEqual([])
      for (const resource of ['units', 'materials']) {
        expect((await asStudent(`${studentModulePath}/${resource}`)).status).toBe(404)
        expect(
          (await anonymous(`${studentModulePath}/${resource}`, { headers: forged })).status,
        ).toBe(401)
        expect((await unenrolled(`${studentModulePath}/${resource}`)).status).toBe(403)
        expect((await request(`${studentModulePath}/${resource}`)).status).toBe(403)
        expect((await asStudent(`${other}/student/modules/${module.id}/${resource}`)).status).toBe(
          404,
        )
      }
      await change('visibility', { visibility: 'visible' })
      expect(await readStudent()).toEqual([{ ...module, published: true, visibility: 'visible' }])
      const studentUnits = await asStudent(`${studentModulePath}/units`)
      expect(studentUnits.status).toBe(200)
      expect(await studentUnits.json()).toEqual({ units: [unit] })
      const studentMaterials = await asStudent(`${studentModulePath}/materials`)
      expect(studentMaterials.status).toBe(200)
      const metadata = (await studentMaterials.json()) as { materials: Record<string, unknown>[] }
      expect(metadata.materials).toMatchObject([{ filename: 'field-notes.pdf' }])
      expect(metadata.materials[0]).not.toHaveProperty('storedFilename')
      await change('publication', { published: false })
      expect(await readStudent()).toEqual([])
      expect((await asStudent(`${studentModulePath}/units`)).status).toBe(404)
      expect((await asStudent(`${studentModulePath}/materials`)).status).toBe(404)
      await change('publication', { published: true })
      await change('visibility', { visibility: 'hidden' })
      expect(await readStudent()).toEqual([])
      expect(getLearningModulesByCourse(courseId)).toContainEqual(standardFixture)
      expect(getLearningModulesByCourse(courseId).some(({ id }) => id === module.id)).toBe(false)

      const app = await createApp()
      for (const [path, status] of [
        [modules, 403],
        [`${course}/student/modules`, 401],
      ] as const) {
        const response = await app.fetch(
          new Request(`http://localhost${path}`, {
            headers: { ...forged, cookie: instructorCookie },
          }),
        )
        expect(response.status).toBe(status)
      }
    }),
  )
})

test('demo modules, access state, and uploaded files survive a process restart', async () => {
  await withTestData(async (directory) => {
    const course = coursePath(courseId)
    const modules = `${course}/modules`
    const contents = '%PDF-persistence-test'
    const saved = await withDemoProcess(directory, async (url) => {
      const cookie = await signIn(url, 'instructor')
      const request = client(url, cookie)
      const created = await request(
        modules,
        json('POST', { title: 'Persistent presentation module' }),
      )
      expect(created.status).toBe(201)
      const { module } = (await created.json()) as { module: LearningModule }
      const modulePath = `${modules}/${module.id}`

      const unitResponse = await request(
        `${modulePath}/units`,
        json('POST', { title: 'Persistent unit' }),
      )
      expect(unitResponse.status).toBe(201)
      const { unit } = (await unitResponse.json()) as {
        unit: { id: string; moduleId: string; title: string }
      }
      expect(unit).toMatchObject({ moduleId: module.id, title: 'Persistent unit' })

      for (const [operation, state] of [
        ['publication', { published: true }],
        ['visibility', { visibility: 'visible' }],
      ] as const) {
        const changed = await request(`${modulePath}/${operation}`, json('PATCH', state))
        expect(changed.status).toBe(200)
      }

      const form = new FormData()
      form.append('file', new File([contents], 'persistent.pdf', { type: 'application/pdf' }))
      const uploaded = await request(`${modulePath}/materials`, {
        method: 'POST',
        body: form,
      })
      expect(uploaded.status).toBe(201)
      const { material } = (await uploaded.json()) as { material: { storedFilename: string } }
      return {
        module: { ...module, published: true, visibility: 'visible' },
        unit,
        material,
        cookie,
      }
    })

    await withDemoProcess(directory, async (url) => {
      expect((await client(url, saved.cookie)(modules)).status).toBe(403)
      const asInstructor = client(url, await signIn(url, 'instructor'))
      const asStudent = client(url, await signIn(url, 'student'))
      for (const [path, request] of [
        [modules, asInstructor],
        [`${course}/student/modules`, asStudent],
      ] as const) {
        const response = await request(path)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ modules: [saved.module] })
      }
      const modulePath = `${modules}/${saved.module.id}`
      const units = await asInstructor(`${modulePath}/units`)
      expect(units.status).toBe(200)
      expect(await units.json()).toEqual({ units: [saved.unit] })
      const materials = await asInstructor(`${modulePath}/materials`)
      expect(materials.status).toBe(200)
      expect(await materials.json()).toEqual({ materials: [saved.material] })
      expect(
        await readFile(join(directory, 'demo-uploads', saved.material.storedFilename), 'utf8'),
      ).toBe(contents)
    })
  })
})
