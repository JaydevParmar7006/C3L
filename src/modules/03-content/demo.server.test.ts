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

test('loopback HTTP demo supports the instructor-to-student workflow in isolated storage', async () => {
  await withTestData((directory) =>
    withDemoProcess(directory, async (url) => {
      expect(url.hostname).toBe('127.0.0.1')
      const request = (path: string, init?: RequestInit) => fetch(new URL(path, url), init)
      for (const path of ['/manage', '/learn']) {
        const page = await request(`${base}${path}?courseId=OTHER-101`)
        expect(page.status).toBe(200)
        expect(page.headers.get('content-type')).toContain('text/html')
        const html = await page.text()
        expect(html).toContain(
          'Authentication, instructor permissions, and course enrollment are simulated.',
        )
        expect(html).toContain('value="DEMO-101"')
        expect(html).not.toContain('OTHER-101')
      }

      const otherLocalAddress = new URL(url)
      otherLocalAddress.hostname = '127.0.0.2'
      await expect(fetch(otherLocalAddress, { proxy: '' })).rejects.toThrow()

      const course = coursePath(courseId)
      const modules = `${course}/modules`
      const readStudent = async () => {
        const response = await request(`${course}/student/modules`, { headers: forged })
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
      expect((await request(`${other}/student/modules`, { headers: forged })).status).toBe(404)
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

      const change = async (operation: string, body: object) => {
        const response = await request(`${modules}/${module.id}/${operation}`, json('PATCH', body))
        expect(response.status).toBe(200)
      }
      expect(await readStudent()).toEqual([])
      await change('publication', { published: true })
      expect(await readStudent()).toEqual([])
      await change('visibility', { visibility: 'visible' })
      expect(await readStudent()).toEqual([{ ...module, published: true, visibility: 'visible' }])
      await change('publication', { published: false })
      expect(await readStudent()).toEqual([])
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
          new Request(`http://localhost${path}`, { headers: forged }),
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
      const request = (path: string, init?: RequestInit) => fetch(new URL(path, url), init)
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
      return { module: { ...module, published: true, visibility: 'visible' }, unit, material }
    })

    await withDemoProcess(directory, async (url) => {
      for (const path of [modules, `${course}/student/modules`]) {
        const response = await fetch(new URL(path, url))
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ modules: [saved.module] })
      }
      const modulePath = `${modules}/${saved.module.id}`
      const units = await fetch(new URL(`${modulePath}/units`, url))
      expect(units.status).toBe(200)
      expect(await units.json()).toEqual({ units: [saved.unit] })
      const materials = await fetch(new URL(`${modulePath}/materials`, url))
      expect(materials.status).toBe(200)
      expect(await materials.json()).toEqual({ materials: [saved.material] })
      expect(
        await readFile(join(directory, 'demo-uploads', saved.material.storedFilename), 'utf8'),
      ).toBe(contents)
    })
  })
})
