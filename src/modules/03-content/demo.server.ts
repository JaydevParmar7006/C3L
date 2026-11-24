import { join } from 'node:path'
import { Elysia } from 'elysia'
import type { AuthenticatedUser } from './content.auth'
import { createContentTables, openContentDatabase } from './content.database'
import { createStudentContentRoutes } from './content.student.routes'
import { studentUiRoutes } from './content.student.ui'
import { contentUiRoutes } from './content.ui'
import { createMaterialListRoutes } from './material.list.routes'
import { createMaterialUploadRoutes } from './material.upload.routes'
import { createModuleAccessRoutes } from './module.access.routes'
import { createInstructorModuleRoutes } from './module.instructor.routes'
import { withContentDatabase } from './module.service'
import { createUnitRoutes } from './unit.routes'

const hostname = '127.0.0.1'
const base = '/03-content'
const course = { id: 'DEMO-101', title: 'Presentation demo' }
const student: AuthenticatedUser = { id: 'demo-student', role: 'student', active: true }
const notice =
  'Presentation demo. Authentication, instructor permissions, and course enrollment are simulated.'
const instructorPage = `${base}/manage`
const studentPage = `${base}/learn`

function labelDemoPage(response: Response, path: string) {
  const instructor = path === instructorPage
  return new HTMLRewriter()
    .on('.notice', {
      element(element) {
        element.setInnerContent(instructor ? notice : `${notice} File downloads are unavailable.`)
      },
    })
    .on('#course-id', {
      element(element) {
        element.setAttribute('value', course.id)
        element.setAttribute('readonly', '')
      },
    })
    .on('nav', {
      element(element) {
        element.setInnerContent(
          instructor
            ? `<a href="${base}">Demo home</a><a href="${studentPage}">Student Learning</a>`
            : `<a href="${base}">Demo home</a><a href="${instructorPage}">Instructor Workspace</a>`,
          { html: true },
        )
      },
    })
    .transform(response)
}

export function startContentDemo(
  port = 3103,
  dataDirectory = join(import.meta.dir, '.c3l-content-data'),
) {
  if (Bun.env.NODE_ENV === 'production') {
    throw new Error('The content demo cannot run in production.')
  }
  if (Bun.env.C3L_CONTENT_DEMO !== '1') {
    throw new Error('Set C3L_CONTENT_DEMO=1 to start the content demo.')
  }

  const uploadDirectory = join(dataDirectory, 'demo-uploads')
  const database = openContentDatabase(join(dataDirectory, 'demo.sqlite'))

  try {
    createContentTables(database)
    const authorizeInstructor = (_request: Request, courseId: string) => courseId === course.id
    const app = new Elysia()
      .get('/', () => new Response(null, { status: 302, headers: { location: base } }))
      .group(base, (scope) =>
        scope
          .get(
            '/',
            () =>
              new Response(
                `<!doctype html><html lang="en"><meta charset="utf-8"><title>C3L Content Demo</title>
              <h1>C3L Module 3 Presentation Demo</h1><p>${notice}</p><p>Course: ${course.id}</p>
              <nav><a href="${instructorPage}">Instructor Workspace</a> ·
              <a href="${studentPage}">Student Learning</a></nav></html>`,
                { headers: { 'content-type': 'text/html; charset=utf-8' } },
              ),
          )
          .use(contentUiRoutes)
          .use(studentUiRoutes)
          .use(createInstructorModuleRoutes(authorizeInstructor))
          .use(createModuleAccessRoutes({ authorizeInstructor }))
          .use(createUnitRoutes({ authorizeInstructor }))
          .use(createMaterialUploadRoutes({ authorizeInstructor, uploadDirectory }))
          .use(createMaterialListRoutes({ authorizeInstructor }))
          .use(
            createStudentContentRoutes({
              identity: { currentUser: async () => student },
              courses: { getCourse: async (courseId) => (courseId === course.id ? course : null) },
              permissions: {
                canManage: async () => false,
                canStudy: async (user, courseId) =>
                  user.id === student.id && courseId === course.id,
              },
            }),
          ),
      )

    const server = Bun.serve({
      hostname,
      port,
      async fetch(request, server) {
        const host = `${hostname}:${server.port}`
        const origin = request.headers.get('origin')
        const site = request.headers.get('sec-fetch-site')
        // Stop DNS rebinding and browser requests from other origins.
        if (
          request.headers.get('host') !== host ||
          (origin !== null && origin !== `http://${host}`) ||
          (site !== null && site !== 'same-origin' && site !== 'none')
        ) {
          return new Response('Use the local demo URL directly.', { status: 403 })
        }

        const response = await withContentDatabase(database, () => app.handle(request))
        const path = new URL(request.url).pathname.replace(/\/$/, '')
        if (response.ok && (path === instructorPage || path === studentPage)) {
          return labelDemoPage(response, path)
        }
        return response
      },
    })

    return {
      url: server.url,
      uploadDirectory,
      async stop() {
        await server.stop()
        database.close()
      },
    }
  } catch (error) {
    database.close()
    throw error
  }
}

if (import.meta.main) {
  const demo = startContentDemo()
  console.log(notice)
  console.log(`Instructor: ${new URL(instructorPage, demo.url)}`)
  console.log(`Student:    ${new URL(studentPage, demo.url)}`)
  const stop = async () => {
    await demo.stop()
    process.exit(0)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
