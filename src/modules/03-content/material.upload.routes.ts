
import { Elysia } from 'elysia'
import { getLearningModulesByCourse } from './module.service'
import { saveLearningMaterial } from './material.storage'
import { validateLearningMaterial } from './material.validation'

// This route handles uploading learning materials to a module.
export const materialUploadRoutes = new Elysia().post(
  '/api/courses/:courseId/modules/:moduleId/materials',
  async ({ params, request, set }) => {
    // Get the course ID and module ID from the URL.
    const { courseId, moduleId } = params

    // Check if the module exists in the selected course.
    const module = getLearningModulesByCourse(courseId).find(
      (item) => item.id === moduleId,
    )

    // Do not allow uploads to a missing or incorrect module.
    if (!module) {
      set.status = 404
      return { error: 'Learning module not found' }
    }

    // Check that the request contains multipart form data.
    const contentType = request.headers.get('content-type') ?? ''

    if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
      set.status = 400
      return { error: 'Request must contain multipart form data' }
    }

    // Read the uploaded form safely.
    let form: Awaited<ReturnType<typeof request.formData>>

    try {
    // Get the file and other information from the request.
    form = await request.formData()
    } catch {
    // Return an error if the form cannot be read.
    set.status = 400
    return { error: 'Invalid upload form data' }
    }

    // Get the file from the form field named "file".
    const file = form.get('file')

    // Make sure an actual file was provided.
    if (!(file instanceof File)) {
      set.status = 400
      return { error: 'A file is required' }
    }

    
    // Check the file before saving it.
    // This includes its size and supported file type.
    const validationError = validateLearningMaterial(file)

    // Return a clear error if the file is not allowed.
    if (validationError) {
      set.status = 400
      return { error: validationError }
    }


    // Save the actual file contents to disk.
    try {
      const savedFile = await saveLearningMaterial(file)

      // Create information about the uploaded material.
      const material = {
        id: crypto.randomUUID(),
        courseId,
        moduleId,
        filename: file.name,
        storedFilename: savedFile.storedFilename,
        size: file.size,
        mimeType: file.type,
        uploadedAt: new Date().toISOString(),
      }

      // Return success after the file has been saved.
      set.status = 201
      return { material }
    } catch {
      // Return an error if the file cannot be saved.
      set.status = 500
      return { error: 'Unable to save uploaded file' }
    }

  },
  // Let us read and validate the multipart request ourselves.
  { parse: 'none' },
)
