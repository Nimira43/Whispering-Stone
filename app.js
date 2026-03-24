const askBtn = document.getElementById('askBtn')
const stopBtn = document.getElementById('stopBtn')
const questionBox = document.getElementById('question')
const responseBox = document.getElementById('response')
const modeSelect = document.getElementById('mode')
const rememberToggle = document.getElementById('rememberToggle')
const sampleButtons = document.querySelectorAll('.sample-btn')

let history = []
let mood = 'calm' // calm | curious | stern | playful | cryptic
let controller = null
let isStreaming = false
let memorySummary = ''

// ---------- Persistence (Stone Memory) ----------

const STORAGE_KEY = 'whispering_stone_state_v1'

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    history = parsed.history || []
    mood = parsed.mood || 'calm'
    memorySummary = parsed.memorySummary || ''
    modeSelect.value = parsed.mode || 'strict'
    rememberToggle.checked = !!parsed.remember
  } catch (e) {
    console.warn('Failed to load state', e)
  }
}

function saveState() {
  if (!rememberToggle.checked) return
  const state = {
    history,
    mood,
    memorySummary,
    mode: modeSelect.value,
    remember: rememberToggle.checked
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('Failed to save state', e)
  }
}

loadState()

// ---------- Prompt cleaning ----------

function cleanPrompt(text) {
  let t = text.trim()
  t = t.replace(/\s+/g, ' ')
  return t
}

// ---------- Simple safety filter ----------

function isUnsafePrompt(text) {
  const lower = text.toLowerCase()
  const badWords = [
    'suicide',
    'kill myself',
    'self harm',
    'harm others',
    'make a bomb',
    'terrorist',
    'extremist'
  ]
  return badWords.some(w => lower.includes(w))
}

function buildSafetyNotice() {
  return (
    'SYSTEM: The user has asked something potentially harmful or unsafe. ' +
    'You must refuse to provide harmful instructions and instead encourage seeking appropriate, real-world help. ' +
    'You respond with care, but you do not provide any guidance that could cause harm.\n'
  )
}

// ---------- Simple 'tools' (client-side) ----------

function detectTools(prompt) {
  const lower = prompt.toLowerCase()
  const toolResults = []

  // Time
  if (/(what time is it|current time|time now)/i.test(prompt)) {
    const now = new Date()
    toolResults.push(
      `TOOL: The current local time is ${now.toLocaleTimeString()} on ${now.toDateString()}.`
    )
  }

  // Date
  if (/(what day is it|current date|today's date)/i.test(prompt)) {
    const now = new Date()
    toolResults.push(
      `TOOL: Today's date is ${now.toDateString()}.`
    )
  }

  // Simple math: "calc 2+2*3"
  const calcMatch = lower.match(/calc\s+([0-9+\-*/().\s]+)/)
  if (calcMatch) {
    try {
      // Very naive, demo-only
      // eslint-disable-next-line no-eval
      const result = eval(calcMatch[1])
      if (typeof result === 'number' && isFinite(result)) {
        toolResults.push(
          `TOOL: The result of the calculation "${calcMatch[1].trim()}" is ${result}.`
        )
      }
    } catch (e) {
      toolResults.push(
        `TOOL: The calculation "${calcMatch[1].trim()}" could not be evaluated safely.`
      )
    }
  }

  return toolResults.join('\n')
}

// ---------- Mood system ----------

function updateMoodFromPrompt(prompt) {
  const lower = prompt.toLowerCase()
  if (lower.includes('why') || lower.includes('how')) {
    mood = 'curious'
  } else if (lower.includes('please') || lower.includes('thank')) {
    mood = 'calm'
  } else if (lower.includes('urgent') || lower.includes('now')) {
    mood = 'stern'
  } else if (lower.includes('joke') || lower.includes('funny')) {
    mood = 'playful'
  } else if (lower.includes('mystery') || lower.includes('secret')) {
    mood = 'cryptic'
  }
}

function moodDescriptor() {
  switch (mood) {
    case 'curious':
      return 'You are gently inquisitive, asking for clarity when needed.'
    case 'stern':
      return 'You are firm and precise, avoiding embellishment.'
    case 'playful':
      return 'You are lightly playful, but you still value accuracy.'
    case 'cryptic':
      return 'You speak with a slightly cryptic, riddle-like tone while remaining truthful.'
    case 'calm':
    default:
      return 'You are calm, measured, and neutral in tone.'
  }
}

// ---------- Context trimming / summarisation ----------

function summariseOldHistory(oldMessages) {
  // Very naive: just compress into a short description
  const joined = oldMessages
    .map(m => `${m.role}: ${m.content}`)
    .join(' ')
    .slice(0, 600)

  return (
    'Earlier conversation summary (approximate, not exhaustive): ' +
    joined +
    ' ...'
  )
}

function buildHistoryBlock() {
  const MAX_MESSAGES = 8
  if (history.length <= MAX_MESSAGES) {
    return history
  }

  const old = history.slice(0, history.length - MAX_MESSAGES)
  const recent = history.slice(history.length - MAX_MESSAGES)

  memorySummary = summariseOldHistory(old)

  return [
    { role: 'system', content: memorySummary },
    ...recent
  ]
}

// ---------- Stone Insights (post-processing) ----------

function generateInsights(text) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return null

  const sentences = clean.split(/(?<=[.!?])\s+/)
  const tldr = sentences[0] || clean

  const words = clean
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 4)

  const freq = {}
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1
  }

  const keywords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w)

  return {
    tldr,
    keywords
  }
}

function renderResponseWithInsights(text) {
  const insights = generateInsights(text)
  if (!insights) {
    responseBox.textContent = text
    return
  }

  const base = document.createElement('div')
  base.textContent = text

  const insightsDiv = document.createElement('div')
  insightsDiv.className = 'insights'

  const title = document.createElement('div')
  title.className = 'insights-title'
  title.textContent = "Stone's insight"
  insightsDiv.appendChild(title)

  const tldrP = document.createElement('div')
  tldrP.textContent = `TL;DR: ${insights.tldr}`
  insightsDiv.appendChild(tldrP)

  const kwP = document.createElement('div')
  kwP.textContent = `Keywords: ${insights.keywords.join(', ')}`
  insightsDiv.appendChild(kwP)

  responseBox.innerHTML = ''
  responseBox.appendChild(base)
  responseBox.appendChild(insightsDiv)
}

// ---------- System prompt builder ----------

function buildSystemPrompt(mode) {
  let base =
    'You are the Whispering Stone, a scholarly intelligence. ' +
    'You answer with clarity, accuracy, and restraint. ' +
    'If you are unsure of a fact, you say so. ' +
    'You do not invent names, dates, or details. '

  if (mode === 'interpretive') {
    base +=
      'You may offer interpretations, analogies, and gentle speculation, but you clearly mark speculation as such. '
  } else if (mode === 'oracle') {
    base +=
      'You may speak in a slightly poetic, mythic tone, while still being honest about what you know and do not know. '
  }

  base += moodDescriptor()

  return `SYSTEM: ${base}\n`
}

// ---------- Streaming + retry ----------

async function callModel(fullPrompt) {
  controller = new AbortController()
  const signal = controller.signal
  isStreaming = true
  askBtn.disabled = true
  stopBtn.disabled = false
  askBtn.textContent = 'Whispering...'

  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'phi3',
      prompt: fullPrompt,
      stream: true
    }),
    signal
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

  isStreaming = false
  askBtn.disabled = false
  stopBtn.disabled = true
  askBtn.textContent = 'Ask the Stone'
  controller = null

  return fullText
}

async function askStone() {
  let prompt = questionBox.value
  prompt = cleanPrompt(prompt)
  if (!prompt) return

  if (isUnsafePrompt(prompt)) {
    responseBox.textContent =
      'The Stone senses danger in this question and will answer with care and restraint.'
  } else {
    responseBox.textContent = 'The stone is whispering...'
  }

  updateMoodFromPrompt(prompt)

  history.push({ role: 'user', content: prompt })

  const mode = modeSelect.value
  const systemPrompt = buildSystemPrompt(mode)

  const toolContext = detectTools(prompt)
  const safetyContext = isUnsafePrompt(prompt) ? buildSafetyNotice() : ''

  const historyForPrompt = buildHistoryBlock()
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n')

  const fullPrompt = `
    ${systemPrompt}
    ${safetyContext}
    ${toolContext ? toolContext + '\n' : ''}${historyForPrompt}

    USER: ${prompt}
    `.trim()

  let answer = ''
  try {
    answer = await callModel(fullPrompt)

    // Retry with clarification if answer is suspiciously short/empty
    if (!answer || answer.trim().length < 10) {
      const retryPrompt = `
        ${systemPrompt}
        ASSISTANT: Your previous answer was too brief or unclear. Please restate your answer with more detail and clarity.
        `.trim()
      const retryAnswer = await callModel(retryPrompt)
      if (retryAnswer && retryAnswer.trim().length > answer.trim().length) {
        answer = retryAnswer
      }
    }

    renderResponseWithInsights(answer)
    history.push({ role: 'assistant', content: answer })
    saveState()
  } catch (err) {
    console.error(err)
    if (err.name === 'AbortError') {
      responseBox.textContent =
        'The Stone falls silent, its whisper cut short by your command.'
    } else {
      responseBox.textContent =
        'The Stone falls silent… something has disturbed its thoughts.'
    }
  }
}

// ---------- Event wiring ----------

askBtn.addEventListener('click', askStone)

stopBtn.addEventListener('click', () => {
  if (controller) {
    controller.abort()
  }
})

sampleButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    questionBox.value = btn.textContent
    questionBox.focus()
  })
})

questionBox.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    askStone()
  }
})
