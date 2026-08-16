import { addTaskAttachment, deleteTaskAttachment } from './api-tasks'

export async function syncTaskAttachments(taskId, attachments = [], removedAttachmentIds = []) {
  for (const attachmentId of removedAttachmentIds) {
    await deleteTaskAttachment(taskId, attachmentId)
  }

  for (const file of attachments) {
    if (file.isPending && file.data) {
      await addTaskAttachment(taskId, {
        fileName: file.file_name,
        contentType: file.content_type,
        data: file.data,
      })
    }
  }
}

export function attachmentsFromTask(task) {
  return (task?.task_attachments || []).map((file) => ({
    id: file.id,
    file_name: file.file_name,
    content_type: file.content_type,
    signed_url: file.signed_url,
    isPending: false,
  }))
}
