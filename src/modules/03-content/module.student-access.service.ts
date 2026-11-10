
import type { LearningModule } from './module.model'
import { getLearningModulesByCourse } from './module.service'

/**
 * Trusted course-access check supplied by the integration layer.
 *
 * This must verify the actual authenticated student and
 * their enrollment. Never trust client-supplied student IDs.
 */
export type StudentCourseAuthorizer = (
  request: Request,
  courseId: string,
) => boolean | Promise<boolean>

/**
 * Returns modules eligible for student access.
 *
 * M03-FR-005: Only published modules are eligible.
 * M03-FR-006: Hidden modules must not be accessible.
 *
 * Denies access when no trusted authorization dependency
 * is available or when authorization fails.
 *
 * This is an internal service, not an HTTP endpoint.
 */
export async function getStudentAccessibleModules(
  request: Request,
  courseId: string,
  authorizeStudent?: StudentCourseAuthorizer,
): Promise<LearningModule[]> {
  if (
    typeof courseId !== 'string' ||
    !courseId.trim() ||
    !authorizeStudent
  ) {
    return []
  }

  try {
    const authorized = await authorizeStudent(request, courseId)

    if (authorized !== true) {
      return []
    }
  } catch {
    return []
  }

  return getLearningModulesByCourse(courseId)
    .filter(
      (module) =>
        module.published === true &&
        module.visibility === 'visible',
    )
    .map((module) => ({ ...module }))
}
