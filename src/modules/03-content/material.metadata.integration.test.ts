
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  getContentDatabase,
  createLearningModule,
} from './module.service'
import { createMaterialUploadRoutes } from './material.upload.routes'
import { getMaterialsFromDatabase } from './content.database'
import { getLearningMaterialsByModule } from './material.service'
import type { LearningMaterial } from './material.model'

// Create a valid PDF upload request for integration testing.
function createUploadRequest(
  courseId: string,
  moduleId: string,
): Request {
  const form = new FormData()

  form.append(
    'file',
    new File(
      ['%PDF-1.4\nTest PDF content'],
      'lecture.pdf',
      { type: 'application/pdf' },
    ),
  )

  return new Request(
    `http://localhost/api/courses/${courseId}/modules/${moduleId}/materials`,
    {
      method: 'POST',
      body: form,
    },
  )
}

describe('Learning material metadata integration', () => {
  test('persists metadata after a successful upload', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'c3l-metadata-success-'),
    )

    try {
      const courseId = `metadata-${crypto.randomUUID()}`

      const module = createLearningModule({
        courseId,
        title: 'Material Persistence',
      })

      const router = createMaterialUploadRoutes({
        authorizeInstructor: () => true,
        uploadDirectory: directory,
      })

      const response = await router.handle(
        createUploadRequest(courseId, module.id),
      )

      expect(response.status).toBe(201)

      const body = (await response.json()) as {
        material: LearningMaterial
      }

      const materials = getLearningMaterialsByModule(
        courseId,
        module.id,
      )

      expect(materials).toHaveLength(1)
      expect(materials[0]).toEqual(body.material)

      expect(body.material.courseId).toBe(courseId)
      expect(body.material.moduleId).toBe(module.id)
      expect(body.material.filename).toBe('lecture.pdf')
      expect(body.material.mimeType).toBe('application/pdf')
      expect(body.material.size).toBeGreaterThan(0)

      expect(
        await Bun.file(
          join(directory, body.material.storedFilename),
        ).exists(),
      ).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('unauthorized uploads create no metadata or files', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'c3l-metadata-denied-'),
    )

    try {
      const courseId = `denied-${crypto.randomUUID()}`

      const module = createLearningModule({
        courseId,
        title: 'Protected Materials',
      })

      const router = createMaterialUploadRoutes({
        uploadDirectory: directory,
      })

      const response = await router.handle(
        createUploadRequest(courseId, module.id),
      )

      expect(response.status).toBe(403)

      expect(
        getLearningMaterialsByModule(courseId, module.id),
      ).toEqual([])

      expect(await readdir(directory)).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('rejects uploads using an incorrect course ID', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'c3l-metadata-course-'),
    )

    try {
      const courseId = `course-${crypto.randomUUID()}`
      const wrongCourseId = `wrong-${crypto.randomUUID()}`

      const module = createLearningModule({
        courseId,
        title: 'Course Isolation',
      })

      const router = createMaterialUploadRoutes({
        authorizeInstructor: () => true,
        uploadDirectory: directory,
      })

      const response = await router.handle(
        createUploadRequest(wrongCourseId, module.id),
      )

      expect(response.status).toBe(404)

      expect(
        getMaterialsFromDatabase(
          getContentDatabase(),
          wrongCourseId,
          module.id,
        ),
      ).toEqual([])

      expect(
        getLearningMaterialsByModule(courseId, module.id),
      ).toEqual([])

      expect(await readdir(directory)).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('isolates uploaded metadata between modules and courses', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'c3l-metadata-isolation-'),
    )

    try {
      const courseA = `course-a-${crypto.randomUUID()}`
      const courseB = `course-b-${crypto.randomUUID()}`

      const firstModule = createLearningModule({
        courseId: courseA,
        title: 'First Module',
      })

      const secondModule = createLearningModule({
        courseId: courseA,
        title: 'Second Module',
      })

      const thirdModule = createLearningModule({
        courseId: courseB,
        title: 'Different Course Module',
      })

      const router = createMaterialUploadRoutes({
        authorizeInstructor: () => true,
        uploadDirectory: directory,
      })

      const response = await router.handle(
        createUploadRequest(courseA, firstModule.id),
      )

      expect(response.status).toBe(201)

      expect(
        getLearningMaterialsByModule(courseA, firstModule.id),
      ).toHaveLength(1)

      expect(
        getLearningMaterialsByModule(courseA, secondModule.id),
      ).toEqual([])

      expect(
        getLearningMaterialsByModule(courseB, thirdModule.id),
      ).toEqual([])

      expect(await readdir(directory)).toHaveLength(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('removes the uploaded file when metadata insertion fails', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'c3l-metadata-cleanup-'),
    )

    const courseId = `failure-${crypto.randomUUID()}`

    const triggerName =
      `test_metadata_failure_${crypto.randomUUID().replace(/-/g, '')}`

    try {
      const module = createLearningModule({
        courseId,
        title: 'Metadata Failure Cleanup',
      })

      // Simulate a database insertion failure for this test course.
      getContentDatabase().exec(`
        CREATE TEMP TRIGGER ${triggerName}
        BEFORE INSERT ON learning_materials
        WHEN NEW.course_id = '${courseId}'
        BEGIN
          SELECT RAISE(ABORT, 'Simulated metadata failure');
        END;
      `)

      const router = createMaterialUploadRoutes({
        authorizeInstructor: () => true,
        uploadDirectory: directory,
      })

      const response = await router.handle(
        createUploadRequest(courseId, module.id),
      )

      expect(response.status).toBe(500)

      expect(await response.json()).toEqual({
        error: 'Unable to save uploaded file',
      })

      expect(
        getLearningMaterialsByModule(courseId, module.id),
      ).toEqual([])

      // The uploaded file must have been removed.
      expect(await readdir(directory)).toEqual([])
    } finally {
      getContentDatabase().exec(
        `DROP TRIGGER IF EXISTS ${triggerName}`,
      )

      await rm(directory, { recursive: true, force: true })
    }
  })
})
