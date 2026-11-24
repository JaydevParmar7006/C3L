
/**
 * Module 3: Content Management
 * Sprint 3: Learning Unit Validation
 */

/**
 * Validates learning-unit creation input.
 *
 * Returns an error message for invalid input,
 * or null when the input is valid.
 */
export function validateLearningUnitInput(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return 'Invalid learning unit input'
  }

  const data = input as Record<string, unknown>

  if (typeof data.courseId !== 'string' || !data.courseId.trim()) {
    return 'Course ID is required'
  }

  if (typeof data.moduleId !== 'string' || !data.moduleId.trim()) {
    return 'Module ID is required'
  }

  if (typeof data.title !== 'string' || !data.title.trim()) {
    return 'Learning unit title is required'
  }

  if (
    data.description !== undefined &&
    typeof data.description !== 'string'
  ) {
    return 'Description must be a string'
  }

  return null
}
