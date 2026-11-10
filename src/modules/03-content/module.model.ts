
export interface LearningModule {
  id: string
  courseId: string
  title: string
  description?: string
  week?: number
  topic?: string
  createdAt: string

  // Sprint 2: Publication and visibility state
  published: boolean
  visibility: 'visible' | 'hidden'
}

export interface CreateLearningModuleInput {
  courseId: string
  title: string
  description?: string
  week?: number
  topic?: string
}
