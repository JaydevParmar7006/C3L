
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { createLearningModule } from './module.service'
import { materialUploadRoutes } from './material.upload.routes'

// These tests check if learning materials can be uploaded correctly.
describe('M03-FR-003: Learning-material uploads', () => {
  test('uploads a PDF to an existing learning module', async () => {
    // Create a unique course ID for this test.
    const courseId = `upload-test-${crypto.randomUUID()}`

    // Create a module where we will upload the PDF.
    const module = createLearningModule({
      courseId,
      title: 'Week 1 Materials',
    })

    // Create a form to send the file to the upload API.
    const form = new FormData()

    // Create a small sample PDF file for testing.
    const file = new File(
      ['%PDF-1.4\nTest PDF content'],
      'lecture.pdf',
      { type: 'application/pdf' },
    )

    // Add the PDF file to the form.
    form.append('file', file)

    // Send the file to our upload endpoint.
    const response = await materialUploadRoutes.handle(
      new Request(
        `http://localhost/api/courses/${courseId}/modules/${module.id}/materials`,
        {
          method: 'POST',
          body: form,
        },
      ),
    )

    // Check that the server returns 201 for a successful upload.
    expect(response.status).toBe(201)

    // Read the information returned by the server.
    const body = (await response.json()) as {
      material: {
        id: string
        courseId: string
        moduleId: string
        filename: string
        storedFilename: string
      }
    }


        // Find the uploaded file inside Module 3.
    const filePath = join(
      import.meta.dir,
      '.c3l-content-uploads',
      body.material.storedFilename,
    )

    // Always clean up the uploaded file.
    try {
      expect(body.material.id).toBeTruthy()
      expect(body.material.courseId).toBe(courseId)
      expect(body.material.moduleId).toBe(module.id)
      expect(body.material.filename).toBe('lecture.pdf')

      // Read the saved file.
      const savedFile = Bun.file(filePath)

      expect(await savedFile.exists()).toBe(true)
      expect(await savedFile.text()).toBe(
        '%PDF-1.4\nTest PDF content',
      )
    } finally {
      // Delete the uploaded test file.
      await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
    }
  })

  test('rejects an unsupported file upload', async () => {
    // Create a unique course ID for this test.
    const courseId = `upload-test-${crypto.randomUUID()}`

    // Create a module that belongs to this course.
    const module = createLearningModule({
      courseId,
      title: 'Week 2 Materials',
    })

    // Create an unsupported executable file.
    const file = new File(
      ['This is not a learning document'],
      'program.exe',
      { type: 'application/x-msdownload' },
    )

    // Add the file to the upload form.
    const form = new FormData()
    form.append('file', file)

    // Try to upload the unsupported file.
    const response = await materialUploadRoutes.handle(
      new Request(
        `http://localhost/api/courses/${courseId}/modules/${module.id}/materials`,
        {
          method: 'POST',
          body: form,
        },
      ),
    )

    // The server should reject the unsupported file.
    expect(response.status).toBe(400)

    // Check that the error message is correct.
    expect(await response.json()).toEqual({
      error: 'Unsupported file type',
    })
  })


  test('rejects an upload when no file is provided', async () => {
    // Create a unique course for this test.
    const courseId = `upload-test-${crypto.randomUUID()}`

    // Create a module that belongs to this course.
    const module = createLearningModule({
      courseId,
      title: 'Week 3 Materials',
    })

    // Create an empty form without adding a file.
    const form = new FormData()
    form.append('description', 'No file attached')

    // Send the form to the upload endpoint.
    const response = await materialUploadRoutes.handle(
      new Request(
        `http://localhost/api/courses/${courseId}/modules/${module.id}/materials`,
        {
          method: 'POST',
          body: form,
        },
      ),
    )

    // The API should reject the request.
    expect(response.status).toBe(400)

    // Check that the error message explains the problem.
    expect(await response.json()).toEqual({
      error: 'A file is required',
    })
  })


  test('rejects an upload to a nonexistent module', async () => {
    // Create a unique course ID.
    const courseId = `upload-test-${crypto.randomUUID()}`

    // Use a module ID that does not exist.
    const moduleId = crypto.randomUUID()

    // Create a sample PDF file.
    const file = new File(
      ['%PDF-1.4\nTest PDF content'],
      'lecture.pdf',
      { type: 'application/pdf' },
    )

    // Add the PDF to the upload form.
    const form = new FormData()
    form.append('file', file)

    // Try uploading to the nonexistent module.
    const response = await materialUploadRoutes.handle(
      new Request(
        `http://localhost/api/courses/${courseId}/modules/${moduleId}/materials`,
        {
          method: 'POST',
          body: form,
        },
      ),
    )

    // The API should return 404 because the module does not exist.
    expect(response.status).toBe(404)

    // Check that the error message is correct.
    expect(await response.json()).toEqual({
      error: 'Learning module not found',
    })
  })


  test('rejects an upload when the module belongs to another course', async () => {
    // Create two different course IDs.
    const firstCourseId = `course-one-${crypto.randomUUID()}`
    const secondCourseId = `course-two-${crypto.randomUUID()}`

    // Create a module that belongs to the first course.
    const module = createLearningModule({
      courseId: firstCourseId,
      title: 'Week 4 Materials',
    })

    // Create a sample PDF file.
    const file = new File(
      ['%PDF-1.4\nTest PDF content'],
      'lecture.pdf',
      { type: 'application/pdf' },
    )

    // Add the PDF file to the form.
    const form = new FormData()
    form.append('file', file)

    // Try uploading using the second course ID.
    const response = await materialUploadRoutes.handle(
      new Request(
        `http://localhost/api/courses/${secondCourseId}/modules/${module.id}/materials`,
        {
          method: 'POST',
          body: form,
        },
      ),
    )

    // The API should reject the incorrect course-module association.
    expect(response.status).toBe(404)

    // Check that the error message is correct.
    expect(await response.json()).toEqual({
      error: 'Learning module not found',
    })
  })

})
