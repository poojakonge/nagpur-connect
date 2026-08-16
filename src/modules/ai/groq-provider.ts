/* ════════════════════════════════════════════════════════
   Groq AI Incident Analysis Provider
   Uses Groq Llama API — returns structured JSON
   Stage 1: Full analysis + department mismatch detection
   Stage 2: Department-specific questions (lightweight)
   ════════════════════════════════════════════════════════ */

import Groq from "groq-sdk";
import { env } from "@/lib/env";
import { CATEGORIES } from "@/modules/incidents/category-taxonomy";
import { getDeptConfig } from "@/modules/incidents/dept-params";

/** Raw AI output schema — what Stage 1 LLM returns */
export interface AIRawAnalysis {
  incidentType: string;
  mainCategory: string;
  subcategory: string;

  summary: string;

  severity: {
    level: "critical" | "high" | "medium" | "low";
    score: number;
    reason: string;
  };

  affectedPeople: number | null;

  location: {
    required: boolean;
    provided: boolean;
    text: string | null;
  };

  attachments: {
    required: boolean;
    recommended: boolean;
    reason: string;
  };

  privacy: {
    level: "normal" | "restricted" | "sensitive";
    protectIdentity: boolean;
  };

  requiredDepartments: Array<{
    departmentType: string;
    reason: string;
  }>;

  confidence: {
    overall: number;
    category: number;
    severity: number;
    departmentRouting: number;
  };

  /** NEW: Was there a department mismatch? */
  mismatch: boolean;
  /** NEW: If mismatch=true, what is the correct category slug? */
  suggestedCategory: string | null;
  /** NEW: Human-readable mismatch explanation */
  mismatchReason: string | null;

  questionsForCitizen: Array<{
    question: string;
    reason: string;
  }>;
}

/** Stage 2 output — department-specific questions with interactive types */
export interface AIQuestionSet {
  questions: Array<{
    id: string;
    question: string;
    type: "chip" | "multi_chip" | "yesno" | "text";
    options?: string[];
    placeholder?: string;
    required: boolean;
  }>;
}

// Build the category/subcategory reference for the prompt
function buildCategoryReference(): string {
  return CATEGORIES.map((c) => {
    const subs = c.subcategories.map((s) => `      - ${s.slug}: ${s.name}`).join("\n");
    return `  ${c.slug}: ${c.name}\n${subs}`;
  }).join("\n\n");
}

// Build the department context injection for the prompt
function buildDepartmentContext(selectedDepartment: string): string {
  const cat = CATEGORIES.find((c) => c.slug === selectedDepartment);
  const deptConfig = getDeptConfig(selectedDepartment);
  const name = deptConfig?.name || cat?.name || selectedDepartment;

  return `
DEPARTMENT CONTEXT (IMPORTANT):
The citizen manually selected the department: "${name}" (slug: ${selectedDepartment})

Your FIRST task is to check if this report actually belongs to the "${name}" department.

- If the report IS relevant to "${name}": Set mismatch=false. Analyze ONLY from the "${name}" perspective.
- If the report is NOT relevant to "${name}": Set mismatch=true, set suggestedCategory to the correct category slug, and set mismatchReason to a plain-language explanation.

Do NOT ask department-specific questions when there is a mismatch. Just identify the correct department.`;
}

const BASE_SYSTEM_PROMPT = `You are the AI engine for "Nagpur Connect", a civic incident management platform for the city of Nagpur, Maharashtra, India.

Your job: Analyze a citizen's report and return a SINGLE structured JSON response.

CATEGORIES AND SUBCATEGORIES:
${buildCategoryReference()}

DEPARTMENTS (for routing — use these exact codes):
- police: Police Department
- traffic_police: Traffic Police
- fire_brigade: Fire Brigade
- health_dept: Health Department
- ambulance: Ambulance Services
- water_supply: Water Supply Department
- drainage: Drainage Department
- road_maintenance: Road Maintenance/PWD
- traffic_management: Traffic Management
- waste_management: Waste Management
- environment: Environmental Department
- electricity: Electricity Department
- disaster_management: Disaster Management
- municipal_corp: Municipal Corporation (general)
- public_works: Public Works Department

SEVERITY LEVELS:
- critical: Immediate danger to life, active emergency (score 81-100)
- high: Significant risk, urgent response needed (score 61-80)
- medium: Important issue, normal priority (score 31-60)
- low: Minor inconvenience, can be scheduled (score 0-30)

CORE RULES:
1. One incident CAN require MULTIPLE departments.
2. A road accident needs: police, traffic_police, ambulance.
3. Fire needs: fire_brigade, police, ambulance if injuries.
4. Waterlogging needs: drainage, road_maintenance, traffic_management.
5. If injuries or danger mentioned, set severity to high or critical.
6. For sensitive/crime reports, set privacy.level to "restricted" or "sensitive".
7. Extract location text if mentioned in the report.
8. Be generous with severity scores for safety-related issues.
9. NEVER ask for information the citizen already provided in their description.
10. NEVER ask more than 4 questions total.

You MUST respond with ONLY valid JSON. Use this EXACT schema:

{
  "incidentType": "subcategory_slug",
  "mainCategory": "category_slug",
  "subcategory": "subcategory_slug",
  "summary": "Plain language summary for the citizen (max 200 chars)",
  "severity": {
    "level": "critical|high|medium|low",
    "score": 0-100,
    "reason": "Brief reason"
  },
  "affectedPeople": null or number,
  "location": {
    "required": true,
    "provided": true/false,
    "text": "Extracted location or null"
  },
  "attachments": {
    "required": false,
    "recommended": true/false,
    "reason": "Why a photo would help"
  },
  "privacy": {
    "level": "normal|restricted|sensitive",
    "protectIdentity": false
  },
  "requiredDepartments": [
    { "departmentType": "department_code", "reason": "Why this department" }
  ],
  "confidence": {
    "overall": 0.0-1.0,
    "category": 0.0-1.0,
    "severity": 0.0-1.0,
    "departmentRouting": 0.0-1.0
  },
  "mismatch": false,
  "suggestedCategory": null,
  "mismatchReason": null,
  "questionsForCitizen": []
}`;

export class GroqIncidentAnalysisProvider {
  readonly providerName = "groq";
  private client: Groq;
  private model = "llama-3.3-70b-versatile";
  private fastModel = "llama-3.1-8b-instant";

  constructor() {
    this.client = new Groq({
      apiKey: env.groqApiKey,
    });
  }

  /** Stage 1 — Full analysis with optional dept context */
  async analyze(params: {
    text: string;
    locationContext?: string;
    selectedDepartment?: string;
  }): Promise<{ analysis: AIRawAnalysis; model: string; processingTimeMs: number }> {
    const startTime = Date.now();

    // Build dynamic system prompt
    let systemPrompt = BASE_SYSTEM_PROMPT;
    if (params.selectedDepartment) {
      systemPrompt += "\n\n" + buildDepartmentContext(params.selectedDepartment);
    }

    let userMessage = `Citizen report: "${params.text}"`;
    if (params.locationContext) {
      userMessage += `\n\nLocation context: ${params.locationContext}`;
    }

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    });

    const rawContent = completion.choices[0]?.message?.content || "{}";
    const analysis = JSON.parse(rawContent) as AIRawAnalysis;

    // Basic validation
    if (!analysis.mainCategory || !analysis.summary || !analysis.severity) {
      throw new Error("AI response missing required fields (mainCategory, summary, severity)");
    }

    // Ensure mismatch fields exist
    if (analysis.mismatch === undefined) analysis.mismatch = false;
    if (analysis.suggestedCategory === undefined) analysis.suggestedCategory = null;
    if (analysis.mismatchReason === undefined) analysis.mismatchReason = null;

    return {
      analysis,
      model: this.model,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Stage 2 — Generate department-specific questions.
   * Uses fast model, returns minimal JSON.
   * Already-known info is passed so AI does NOT re-ask.
   */
  async generateDeptQuestions(params: {
    summary: string;
    departmentSlug: string;
    departmentName: string;
    alreadyKnown: string[];
    questionPool: Array<{ id: string; question: string; type: string; options?: string[]; placeholder?: string; required: boolean; skipIfMentioned?: string[] }>;
    originalText: string;
  }): Promise<AIQuestionSet> {
    const poolJson = JSON.stringify(params.questionPool.slice(0, 8), null, 2);

    const systemPrompt = `You are selecting follow-up questions for a civic incident report.
Department: ${params.departmentName}
AI Summary: ${params.summary}

Information already known from the citizen's description:
${params.alreadyKnown.length > 0 ? params.alreadyKnown.map((k) => `- ${k}`).join("\n") : "- (nothing specific yet)"}

You have a pool of possible questions. Select ONLY the most critical MISSING information.
Rules:
1. Do NOT ask about information already provided.
2. Select a maximum of 4 questions.
3. Prefer required=true questions first.
4. Keep the same id, question, type, options, placeholder from the pool.
5. Return ONLY valid JSON: { "questions": [...selected questions...] }`;

    const userMessage = `Original report: "${params.originalText}"

Question pool:
${poolJson}

Select max 4 most relevant questions that are NOT already answered.`;

    try {
      const completion = await this.client.chat.completions.create({
        model: this.fastModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 800,
        response_format: { type: "json_object" },
      });

      const rawContent = completion.choices[0]?.message?.content || '{"questions":[]}';
      const result = JSON.parse(rawContent) as AIQuestionSet;

      // Clamp to max 4
      if (result.questions && result.questions.length > 4) {
        result.questions = result.questions.slice(0, 4);
      }

      return result;
    } catch {
      // Fallback: return first 3 required questions from pool
      const fallback = params.questionPool
        .filter((q) => q.required)
        .slice(0, 3)
        .map((q) => ({
          id: q.id,
          question: q.question,
          type: q.type as "chip" | "multi_chip" | "yesno" | "text",
          options: q.options,
          placeholder: q.placeholder,
          required: q.required,
        }));

      return { questions: fallback };
    }
  }
}
