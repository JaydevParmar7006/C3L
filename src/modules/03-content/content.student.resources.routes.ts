
/**
 * Module 3: Content Management
 * Sprint 3: Protected Student Resource Retrieval
 *
 * Provides authorized student access to learning units
 * and learning material metadata.
 */

import { Elysia } from 'elysia'
import type { Database } from 'bun:sqlite'

import type { AuthenticatedUser } from './content.auth'
import { authorizeCourseAccess } from './content.policy'
import type { StudentRouteDependencies } from './content.student.routes'

import { getContentDatabase } from './module.service'
import { getModulesFromDatabase } from './content.database'
import { getLearningUnitsByModule } from './unit.service'
import { getLearningMaterialsByModule } from './material.service'

export interface StudentResourceRouteDependencies
  extends StudentRouteDependencies {
  database?: Database
}

/**
 * Creates protected student resource routes.
 *
 * Requires trusted authentication, course study permission
 * and a published, visible parent learning module.
 */
export function createStudentResourceRoutes(
  dependencies: StudentResourceRouteDependencies,
) {
  async function retrieveResources(
    request: Request,
    courseId: string,
    moduleId: string,
    resource: 'units' | 'materials',
  ): Promise<Response> {
    let user: AuthenticatedUser | null

    // Verify trusted identity.
    try {
      user = await dependencies.identity.currentUser(request)
    } catch {
      return Response.json(
        { error: 'Authentication service unavailable.' },
        { status: 503 },
      )
    }

    if (!user) {
      return Response.json(
        { error: 'Authentication required.' },
        { status: 401 },
      )
    }

    // Validate route parameters.
    if (!courseId.trim() || !moduleId.trim()) {
      return Response.json(
        { error: 'Course ID and module ID are required' },
        { status: 400 },
      )
    }

    try {
      // Verify trusted course study permission.
      const access = await authorizeCourseAccess(
        user,
        courseId,
        'study',
        dependencies,
      )

      if (!access.allowed) {
        return Response.json(
          { error: 'Course access denied.' },
          { status: access.status },
        )
      }

      // Recheck permissions before retrieving resources.
      const rechecked = await authorizeCourseAccess(
        user,
        courseId,
        'study',
        dependencies,
      )

      if (!rechecked.allowed) {
        return Response.json(
          { error: 'Course access denied.' },
          { status: rechecked.status },
        )
      }

      if (
        access.course.id !== courseId ||
        rechecked.course.id !== courseId
      ) {
        return Response.json(
          { error: 'Course access denied.' },
          { status: 403 },
        )
      }

      // Verify parent-module ownership and availability.
      const database = dependencies.database ?? getContentDatabase()
      const parentModule = getModulesFromDatabase(
        database,
        courseId,
      ).find((module) => module.id === moduleId)

      if (
        !parentModule ||
        parentModule.published !== true ||
        parentModule.visibility !== 'visible'
      ) {
        return Response.json(
          { error: 'Learning module not available.' },
          { status: 404 },
        )
      }

      // Retrieve learning units from the selected database.
      if (resource === 'units') {
        const units = getLearningUnitsByModule(
          courseId,
          moduleId,
          database,
        )

        return Response.json(
          { units },
          { status: 200 },
        )
      }

      // Retrieve student-facing material metadata.
      const materials = getLearningMaterialsByModule(
        courseId,
        moduleId,
        database,
      ).map((material) => ({
        id: material.id,
        courseId: material.courseId,
        moduleId: material.moduleId,
        filename: material.filename,
        size: material.size,
        mimeType: material.mimeType,
        uploadedAt: material.uploadedAt,
      }))

      // Internal storage filenames are not exposed.
      return Response.json(
        { materials },
        { status: 200 },
      )
    } catch {
      return Response.json(
        { error: 'Unable to retrieve learning resources.' },
        { status: 500 },
      )
    }
  }

  return new Elysia()
    .get(
      '/api/courses/:courseId/student/modules/:moduleId/units',
      ({ request, params }) =>
        retrieveResources(
          request,
          params.courseId,
          params.moduleId,
          'units',
        ),
    )
    .get(
      '/api/courses/:courseId/student/modules/:moduleId/materials',
      ({ request, params }) =>
        retrieveResources(
          request,
          params.courseId,
          params.moduleId,
          'materials',
        ),
    )
}
