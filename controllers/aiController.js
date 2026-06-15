const prisma = require('../prisma/client');
const logAudit = require('../middleware/audit');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY not set in .env - voice AI commands will be disabled.');
}

async function callGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(text);
}

exports.processVoiceCommand = async (req, res, next) => {
  try {
    const { transcript, context = {} } = req.body || {};

    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        action: 'respond',
        message: 'Voice AI is not configured (missing GEMINI_API_KEY).',
      });
    }

    // Fetch current reference data for better accuracy
    const [crews, categories] = await Promise.all([
      prisma.crew.findMany({ where: { isActive: true }, select: { name: true } }),
      prisma.jobCategory.findMany({ where: { isActive: true }, select: { name: true } }),
    ]);

    const today = new Date().toISOString().split('T')[0];
    const crewNames = crews.map((c) => c.name).join(', ');
    const categoryNames = categories.map((c) => c.name).join(', ');

    let systemPrompt;
    if (context.mode === 'modal_fill') {
      const activeTab = context.activeTab || 'details';
      let fieldsPrompt = '';

      if (activeTab === 'details') {
        fieldsPrompt = `You are parsing voice commands for the 'Job Details' tab in the Job Management popup.
Your task is to identify and extract values for the following fields based on the user's speech:
- "modalAssigned" (select): Assigned Crew. Expected value: one of the available crews [${crewNames}] or "Unassigned". If the user says a crew name, map it to the exact crew from the list.
- "modalCategory" (select): Job Category. Expected value: one of the available categories [${categoryNames}]. If the user says a category name, map it to the exact category.
- "modalStatus" (select): Job Status. Expected value must be one of: "UNSCHEDULED", "SCHEDULED", or "DONE".
- "modalPremium" (checkbox): Premium status. Expected value: boolean (true/false).
- "modalStartDateInput" (date): Start date. Expected format: "YYYY-MM-DD" using ${today} for relative date calculation.
- "modalEndDateInput" (date): End date. Expected format: "YYYY-MM-DD" using ${today} for relative date calculation.
- "modalDeadlineInput" (date): Deadline date. Expected format: "YYYY-MM-DD" using ${today} for relative date calculation.
- "modalDescription" (textarea): Scope of work (text).`;
      } else if (activeTab === 'proof') {
        fieldsPrompt = `You are parsing voice commands for the 'Notes & Specs' tab in the Job Management popup.
Your task is to identify and extract values for the following fields based on the user's speech:
- "modalSpecSnow" (text): Snow Trigger (e.g., "2 inches").
- "modalSpecGate" (text): Gate Code (e.g., "#1234").
- "modalSpecMulch" (number): Mulch Yardage.
- "modalSpecNotes" (textarea): Property Notes.
- "modalNewNote" (textarea): Add Field Note (text).`;
      } else if (activeTab === 'worksheet') {
        fieldsPrompt = `You are parsing voice commands for the 'Worksheet' tab in the Job Management popup.
Your task is to identify and extract values for the following fields based on the user's speech:
- "modalWorksheetTrucks" (textarea): Trucks / Trailers Used (text).
- "modalWorksheetTools" (textarea): Powered Tools Used (text).
- "modalWorksheetMulchColor" (text): Mulch Color (text).
- "modalWorksheetMulchQty" (number): Mulch (yd³).
- "modalWorksheetCompost" (number): Compost (yd³).
- "modalWorksheetSoil" (number): Soil (yd³).
- "modalWorksheetRiverstoneSize" (text): Riverstone Size (text).
- "modalWorksheetRiverstoneQty" (number): Riverstone (tons).
- "modalWorksheetAgg" (number): 2A/2B (tons).
- "modalWorksheetSnapshot" (number): Snapshot (lbs).
- "modalWorksheetDebris" (number): Debris (loads).
- "modalWorksheetOtherMaterials" (textarea): Other Materials / Details (text).
- "modalWorksheetJobDetails" (textarea): Job Details (text).`;
      } else {
        fieldsPrompt = `Unknown active tab "${activeTab}".`;
      }

      systemPrompt = `You are Gemini, an AI assistant embedded in the Proscape CRM app.
User's voice command: "${transcript}"

Current context:
- Mode: modal_fill
- Active Tab: ${activeTab}
- Today's date: ${today} (use this for any relative dates)

${fieldsPrompt}

Analyze the user's command. If you can identify any fields being mentioned and can extract values for them, respond with a JSON object containing the parsed fields and a descriptive confirmation message.
Only include the fields in the "data" object that you were able to identify and parse from the speech.

Output MUST be a valid minified JSON object (no markdown formatting, no explanations, no backticks) in the following format:
{
  "action": "fill_fields",
  "data": {
    // fieldId: parsedValue pairs
  },
  "message": "Friendly confirmation text listing which fields were recognized and set."
}

If no fields could be identified or parsed, return:
{
  "action": "respond",
  "data": {},
  "message": "I couldn't recognize any fields for the ${activeTab} tab. Please try again."
}`;
    } else {
      systemPrompt = `You are Gemini, an AI assistant embedded in the Proscape CRM app (a landscaping and hardscape service management tool).

User's voice command: "${transcript}"

Current context:
- Page: ${context.currentPage || 'unknown'}
- User role: ${req.user?.role || 'unknown'}
- Today's date: ${today} (use this for any relative dates)

Available crews (use EXACT names): ${crewNames || 'Hardscape Crew, Production Crew'}
Available request types / job categories (use EXACT names): ${categoryNames || 'Hardscape, Mowing, Snow Removal, Standard Service, RFP: Send proposal'}

Your job: Parse the command and output ONLY valid minified JSON (no explanations, no markdown fences):

{
  "action": "add_job" | "add_calendar_note" | "respond" | "unknown",
  "data": object,   // depends on action
  "message": "short friendly confirmation text for the user, e.g. 'Adding a hardscape job for Charles Kranich on 2026-06-15 with the Hardscape crew (2 days).'"
}

For action "add_job", data must be:
{
  "customerName": "exact name spoken, e.g. Charles Kranich",
  "description": "clear summary of the work",
  "requestType": "exact match from available list, e.g. Hardscape",
  "assignedTo": "exact crew name from available list, e.g. Hardscape Crew",
  "scheduledWorkDate": "YYYY-MM-DD",
  "scheduledEndDate": "YYYY-MM-DD or null",
  "isPremium": false
}

For action "add_calendar_note", data must be:
{
  "title": "short title",
  "description": "details",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD or null",
  "noteType": "EVENT"   // or "OTHER"
}

Rules and examples:

Example 1:
Command: "Hey Gemini add a hardscape job at Charles Kranich's house to be done by the hardscape crew on June 15th. They're allotted two days to finish the job."
Output:
{"action":"add_job","data":{"customerName":"Charles Kranich","description":"Hardscape job at Charles Kranich's house","requestType":"Hardscape","assignedTo":"Hardscape Crew","scheduledWorkDate":"2026-06-15","scheduledEndDate":"2026-06-17","isPremium":false},"message":"Adding a hardscape job for Charles Kranich on 2026-06-15 with the Hardscape crew (2 days)."}

Example 2:
Command: "add a note for vacation on June 20 to 22"
Output:
{"action":"add_calendar_note","data":{"title":"Vacation","description":"Vacation","startDate":"2026-06-20","endDate":"2026-06-22","noteType":"EVENT"},"message":"Adding a vacation note from 2026-06-20 to 2026-06-22."}

Example 3 (unclear):
Command: "what's the weather"
Output:
{"action":"respond","data":{},"message":"Sorry, I can only help with adding jobs or calendar notes right now."}

Important:
- Always output dates in strict YYYY-MM-DD using the current date ${today} for reference.
- "two days", "allotted two days" means scheduledWorkDate + 1 day for end date.
- Use exact strings from the crews and categories lists provided.
- Never invent crew names or request types.
- For customer, capture the spoken name in customerName — the backend will try to match it.
- If you cannot confidently map to an action, use "respond".
- Output must be pure valid JSON only.`;
    }

    let parsed;
    try {
      parsed = await callGemini(systemPrompt);
    } catch (geminiErr) {
      console.error('Gemini call failed:', geminiErr);
      return res.json({
        action: 'respond',
        message: 'Sorry, I had trouble reaching Gemini. Please try again or use the regular forms.',
      });
    }

    // Usage logging via existing audit system
    try {
      await logAudit(
        'AI',
        0,
        'VOICE_COMMAND',
        `User issued voice command: ${transcript.substring(0, 200)}`,
        null,
        { action: parsed.action, data: parsed.data, message: parsed.message },
        req.user?.userId,
        req.user?.role
      );
    } catch (auditErr) {
      console.error('[AI] Audit log failed:', auditErr);
    }

    // Post-process for add_job: resolve customerName to customerId if possible
    if (parsed.action === 'add_job' && parsed.data?.customerName) {
      const name = parsed.data.customerName.trim();
      const customers = await prisma.customer.findMany({
        where: {
          displayName: { contains: name, mode: 'insensitive' },
        },
        take: 3,
        select: { id: true, displayName: true },
      });

      if (customers.length === 1) {
        parsed.data.customerId = customers[0].id;
        // keep customerName for the confirmation message
      } else if (customers.length > 1) {
        parsed.message = `I found multiple customers matching "${name}". Please be more specific or use the regular intake form.`;
        parsed.action = 'respond';
        delete parsed.data;
      } else {
        // No match - set isNewClient and split the name into firstName/lastName for the creation endpoint
        parsed.data.isNewClient = true;
        const nameParts = name.split(/\s+/);
        if (nameParts.length > 1) {
          parsed.data.firstName = nameParts[0];
          parsed.data.lastName = nameParts.slice(1).join(' ');
        } else {
          parsed.data.firstName = '';
          parsed.data.lastName = name;
        }
        parsed.message = `Couldn't find an exact match for customer "${name}". I'll create them as a new lead if you proceed.`;
      }
    }

    // Ensure safe defaults for add_job
    if (parsed.action === 'add_job' && parsed.data) {
      parsed.data.isPremium = !!parsed.data.isPremium;
      if (!parsed.data.description) {
        parsed.data.description = parsed.data.customerName || 'Voice command job';
      }
    }

    return res.json(parsed);
  } catch (err) {
    next(err);
  }
};
