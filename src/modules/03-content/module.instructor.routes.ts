import { Elysia } from 'elysia'
import type { ModuleAccessAuthorizer } from './module.access.routes'
import { moduleCreateRoutes } from './module.create.routes'
import { moduleListRoutes } from './module.list.routes'
import { moduleOrganizeRoutes } from './module.organize.routes'

export function createInstructorModuleRoutes(authorizeInstructor?: ModuleAccessAuthorizer) {
  return new Elysia().guard(
    {
      async beforeHandle({ request, params }) {
        const courseId =
          params && 'courseId' in params && typeof params.courseId === 'string'
            ? params.courseId.trim()
            : ''
        try {
          if (courseId && (await authorizeInstructor?.(request, courseId)) === true) return
        } catch {
          // A failed permission lookup must deny access.
        }
        return Response.json({ error: 'Instructor authorization required.' }, { status: 403 })
      },
    },
    (scope) => scope.use(moduleCreateRoutes).use(moduleListRoutes).use(moduleOrganizeRoutes),
  )
}
