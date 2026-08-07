import fs from 'node:fs'

const path = 'src/App.tsx'
let text = fs.readFileSync(path, 'utf8')

const oldBlock = `    if (result.error) return showMessage(friendlyError(result.error.message), 'error')
    showMessage(status === 'approved' ? 'تم اعتماد السجل.' : 'تم رفض السجل.', 'success')
    await loadCommunityData()`

const newBlock = `    if (result.error) return showMessage(friendlyError(result.error.message), 'error')
    showMessage(status === 'approved' ? 'تم اعتماد السجل.' : 'تم رفض السجل.', 'success')
    void supabase.functions.invoke('push-notifications', {
      body: { action: 'record-status', table: record.table, recordId: record.id, status },
    }).then(({ error }) => {
      if (error) console.warn('Push notification was not sent.', error)
    })
    await loadCommunityData()`

if (!text.includes(oldBlock)) {
  if (text.includes("action: 'record-status'")) {
    console.log('Push moderation hook already present.')
    process.exit(0)
  }
  throw new Error('Could not find moderation success block')
}

text = text.replace(oldBlock, newBlock)
fs.writeFileSync(path, text)
console.log('Push moderation hook applied.')
