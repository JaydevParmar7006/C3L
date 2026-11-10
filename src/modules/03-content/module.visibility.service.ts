
import type { LearningModule } from './module.model'
import { getLearningModulesByCourse } from './module.service'

/**
 * M03-FR-006: Supported learning-module visibility states.
 */
export type ModuleVisibility = 'visible' | 'hidden'

/**
 * M03-FR-006: Update a learning module's visibility.
 *
 * Authorization must be verified by the calling API layer.
 * This function must not be exposed directly as an HTTP endpoint.
 *
 * @returns The updated module, or null when the module
 * does not belong to the specified course.
 */
export function setModuleVisibility(
  courseId: string,
  moduleId: string,
  visibility: ModuleVisibility,
): LearningModule | null {
  if (
    typeof courseId !== 'string' ||
    !courseId.trim() ||
    typeof moduleId !== 'string' ||
    !moduleId.trim() ||
    (visibility !== 'visible' && visibility !== 'hidden')
  ) {
    throw new Error('Invalid visibility input.')
  }

  const module = getLearningModulesByCourse(courseId).find(
    (item) => item.id === moduleId,
  )

  if (!module) {
    return null
  }

  module.visibility = visibility

  return { ...module }
}
