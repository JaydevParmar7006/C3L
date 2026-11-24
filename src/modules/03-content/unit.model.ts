/**
 * Module 3: Content Management
 * Sprint 3: Learning Unit Model
 *
 * Learning units belong to a parent learning module
 * and inherit its week and topic organization.
 */

/**
 * Represents a learning unit.
 */
export interface LearningUnit {
  id: string
  courseId: string
  moduleId: string
  title: string
  description?: string
  createdAt: string

  // Organization inherited from the parent module.
  week?: number
  topic?: string
}

/**
 * Input required to create a learning unit.
 */
export interface CreateLearningUnitInput {
  courseId: string
  moduleId: string
  title: string
  description?: string
}
