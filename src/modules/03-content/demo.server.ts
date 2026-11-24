import { join } from 'node:path'
import { Elysia } from 'elysia'
import { createContentTables, openContentDatabase } from './content.database'
import { createStudentResourceRoutes } from './content.student.resources.routes'
import { createStudentContentRoutes } from './content.student.routes'
import { studentUiRoutes } from './content.student.ui'
import { createContentUiRoutes } from './content.ui'
import { createDemoAuth, demoCourse } from './demo.auth'
import {
  demoBase as base,
  demoNotice,
  instructorPage,
  loginPage,
  logoutForm,
  renderCourses,
  renderLogin,
  studentPage,
  workspaceUrl,
} from './demo.pages'
import { createMaterialListRoutes } from './material.list.routes'
import { createMaterialUploadRoutes } from './material.upload.routes'
import { createModuleAccessRoutes } from './module.access.routes'
import { createInstructorModuleRoutes } from './module.instructor.routes'
import { withContentDatabase } from './module.service'
import { createUnitRoutes } from './unit.routes'

const hostname = '127.0.0.1'

function redirect(location: string, status = 302, cookie?: string) {
  const headers = new Headers({ location, 'cache-control': 'no-store' })
  if (cookie) headers.set('set-cookie', cookie)
  return new Response(null, { status, headers })
}

function isSameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin
}

function labelDemoPage(response: Response, path: string) {
  const instructor = path === instructorPage
  return new HTMLRewriter()
    .on('.notice', {
      element(element) {
        element.setInnerContent(
          instructor ? demoNotice : `${demoNotice} File downloads are unavailable.`,
        )
      },
    })
    .on('#course-id', {
      element(element) {
        element.setAttribute('value', demoCourse.id)
        element.setAttribute('readonly', '')
      },
    })
    .on('nav', {
      element(element) {
        element.setInnerContent(`<a href="${base}">Your demo courses</a> ${logoutForm}`, {
          html: true,
        })
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
    const auth = createDemoAuth()
    const studentDependencies = {
      identity: auth.identity,
      courses: auth.courses,
      permissions: auth.permissions,
    }
    const authorizeInstructor = async (request: Request, courseId: string) => {
      const user = await auth.identity.currentUser(request)
      return user !== null && auth.authorize(user, courseId, 'manage')
    }
    const app = new Elysia()
      .get('/', () => redirect(base))
      .group(base, (scope) =>
        scope
          .get('/', async ({ request }) => {
            const user = await auth.identity.currentUser(request)
            if (!user) return redirect(loginPage)
            const role = user.role === 'instructor' ? 'instructor' : 'student'
            const action = role === 'instructor' ? 'manage' : 'study'
            return renderCourses(role, await auth.authorize(user, demoCourse.id, action))
          })
          .get('/login', async ({ request }) =>
            (await auth.identity.currentUser(request)) ? redirect(base) : renderLogin(),
          )
          .post(
            '/login',
            async ({ request }) => {
              if (!isSameOrigin(request))
                return new Response('Use the local demo URL directly.', { status: 403 })
              const invalidForm = { message: 'Submit the demo sign-in form.', status: 400 }
              const contentType = request.headers.get('content-type')?.split(';')[0].trim()
              if (contentType !== 'application/x-www-form-urlencoded')
                return renderLogin(invalidForm)
              let form: Awaited<ReturnType<Request['formData']>>
              try {
                form = await request.formData()
              } catch {
                return renderLogin(invalidForm)
              }
              const cookie = auth.login(request, form.get('username'), form.get('password'))
              return cookie
                ? redirect(base, 303, cookie)
                : renderLogin({ message: 'Incorrect demo username or password.', status: 401 })
            },
            { parse: 'none' },
          )
          .post(
            '/logout',
            ({ request }) =>
              isSameOrigin(request)
                ? redirect(loginPage, 303, auth.logout(request))
                : new Response('Use the local demo URL directly.', { status: 403 }),
            { parse: 'none' },
          )
          .use(createContentUiRoutes({ showResources: true }))
          .use(studentUiRoutes)
          .use(createInstructorModuleRoutes(authorizeInstructor))
          .use(createModuleAccessRoutes({ authorizeInstructor }))
          .use(createUnitRoutes({ authorizeInstructor }))
          .use(createMaterialUploadRoutes({ authorizeInstructor, uploadDirectory }))
          .use(createMaterialListRoutes({ authorizeInstructor }))
          .use(createStudentContentRoutes(studentDependencies))
          .use(createStudentResourceRoutes({ ...studentDependencies, database })),
      )

    const server = Bun.serve({
      hostname,
      port,
      async fetch(request, server) {
        const host = `${hostname}:${server.port}`
        const originUrl = `http://${host}`
        const origin = request.headers.get('origin')
        const site = request.headers.get('sec-fetch-site')
        const url = new URL(request.url)
        const path = url.pathname.replace(/\/$/, '')
        // Stop DNS rebinding and browser requests from other origins.
        if (
          request.headers.get('host') !== host ||
          (origin !== null && origin !== originUrl) ||
          (site !== null && site !== 'same-origin' && site !== 'none')
        ) {
          return new Response('Use the local demo URL directly.', { status: 403 })
        }

        const workspace = path === instructorPage || path === studentPage
        if (workspace) {
          const user = await auth.identity.currentUser(request)
          if (!user) return redirect(loginPage)
          const courseId = url.searchParams.get('courseId')
          const action = path === instructorPage ? 'manage' : 'study'
          if (!(await auth.authorize(user, courseId ?? demoCourse.id, action))) {
            return new Response('Course access denied.', { status: 403 })
          }
          if (courseId === null) return redirect(workspaceUrl(path))
        }

        const response = await withContentDatabase(database, () => app.handle(request))
        response.headers.set('cache-control', 'no-store')
        if (response.ok && workspace) {
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
  console.log(demoNotice)
  console.log(`Sign in at ${new URL(loginPage, demo.url)}`)
  const stop = async () => {
    await demo.stop()
    process.exit(0)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
