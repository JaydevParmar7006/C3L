
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// Store uploaded files in a local folder.
// This location can be configured for testing or deployment.
const uploadDirectory =
  process.env.C3L_CONTENT_UPLOAD_DIR ??
  join(import.meta.dir, '.c3l-content-uploads')

// Save an uploaded file and return its storage details.
export async function saveLearningMaterial(file: File) {
  // Create the upload folder if it does not exist.
  await mkdir(uploadDirectory, { recursive: true })

  // Generate a unique name to avoid overwriting another file.
  const storedFilename = crypto.randomUUID()

  // Build the full path for the new file.
  const filePath = join(uploadDirectory, storedFilename)

  // Save the actual file contents to disk.
  await Bun.write(filePath, file)

  // Return the information needed to find the saved file.
  return {
    storedFilename,
    filePath,
  }
}
