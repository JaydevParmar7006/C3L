
import type { LearningModule } from './module.model'
import { getLearningModulesByCourse } from './module.service'

/**
 * M03-FR-005: Update the publication state of a learning module.
 *
 * Authorization must be verified by the calling API layer.
 * This function must not be exposed directly as an HTTP endpoint.
 *
 * @returns The updated module, or null when the module does
 * not exist in the specified course.
 */
export function setModulePublication(
  courseId: string,
  moduleId: string,
  published: boolean,
): LearningModule | null {
  if (
    typeof courseId !== 'string' ||
    !courseId.trim() ||
    typeof moduleId !== 'string' ||
    !moduleId.trim() ||
    typeof published !== 'boolean'
  ) {
    throw new Error('Invalid publication input.')
  }

  const module = getLearningModulesByCourse(courseId).find(
    (item) => item.id === moduleId,
  )

  if (!module) {
    return null
  }

  module.published = published

  return { ...module }
}
