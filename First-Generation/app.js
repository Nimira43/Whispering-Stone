const askBtn = document.getElementById('askBtn')
const questionBox = document.getElementById('question')
const responseBox = document.getElementById('response')

let history = []

askBtn.addEventListener('click', async () => {
  const prompt = questionBox.value.trim()
  if (!prompt) return

  responseBox.textContent = 'The stone is whispering...'

  history.push({ role: 'user', content: prompt })

  const fullPrompt = `
    SYSTEM: You are the Whispering Stone, a scholarly intelligence. 
    You answer with clarity, accuracy, and restraint. 
    If you are unsure of a fact, you say so. 
    You do not invent names, dates, or details.

    ${history.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}

    USER: ${prompt}
  `

  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'phi3',
      prompt: fullPrompt,
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

  history.push({ role: 'assistant', content: fullText })
})
