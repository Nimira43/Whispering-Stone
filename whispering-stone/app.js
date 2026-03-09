const askBtn = document.getElementById('askBtn')
const questionBox = document.getElementById('question')
const responseBox = document.getElementById('response')

askBtn.addEventListener('click', async () => {
  const prompt = questionBox.value.trim()
  if (!prompt) return

  responseBox.textContent = 'The stone is whispering...'

  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'phi3',
      prompt: prompt,
      stream: true
    })
  })

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    const lines = chunk.split('\n').filter(Boolean)

    for (const line of lines) {
      try {
        const json = JSON.parse(line)
        fullText += json.response
        responseBox.textContent = fullText
      } catch (err) {
        console.error('Bad JSON chunk:', line)
      }
    }
  }
})
