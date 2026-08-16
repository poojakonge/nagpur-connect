/* ════════════════════════════════════════════════════════
   AI Incident Engine — Standalone Test
   Run: npx tsx --env-file=.env.local test-ai-engine.ts
   ════════════════════════════════════════════════════════ */

import { analyzeIncident } from "./src/modules/ai/engine";

const TEST_CASES = [
  {
    name: "Pothole on Wardha Road",
    text: "Huge pothole causing massive traffic jam on Wardha Road near the airport turning. Multiple vehicles have been damaged.",
    expectedCategory: "roads_traffic",
    expectedDepts: ["road_maintenance"],
  },
  {
    name: "Fire in building with trapped people",
    text: "There is a fire in a residential building near Manish Nagar and two people are trapped on the third floor. Smoke is visible from outside.",
    expectedCategory: "fire_rescue",
    expectedDepts: ["fire_brigade", "ambulance"],
  },
  {
    name: "UPI fraud / cyber crime",
    text: "Someone transferred Rs 25,000 from my UPI account without my permission. I received an OTP and then money was gone.",
    expectedCategory: "police_safety",
    expectedDepts: ["police"],
  },
  {
    name: "Waterlogging on road",
    text: "Heavy waterlogging near Ambazari Lake road. Water is knee-deep and traffic is completely blocked. Several cars are stuck.",
    expectedCategory: "water_drainage",
    expectedDepts: ["drainage"],
  },
  {
    name: "Road accident with injuries",
    text: "Two motorcycles collided near Manish Nagar signal. Two people are injured and lying on the road. Traffic is blocked.",
    expectedCategory: "roads_traffic",
    expectedDepts: ["police", "ambulance"],
  },
  {
    name: "Garbage pile",
    text: "There is a huge pile of garbage near the bus stop at Dharampeth. It has been there for a week and is smelling very bad.",
    expectedCategory: "waste_cleanliness",
    expectedDepts: ["waste_management"],
  },
];

async function runTests() {
  console.log("═══════════════════════════════════════");
  console.log("  AI Incident Engine — Test Suite");
  console.log("═══════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    console.log(`▸ Test: ${tc.name}`);
    console.log(`  Input: "${tc.text.slice(0, 80)}..."`);

    try {
      const result = await analyzeIncident({ text: tc.text });

      const categoryMatch = result.mainCategory === tc.expectedCategory;
      const deptsFound = tc.expectedDepts.every((d) =>
        result.departments.some((rd) => rd.code === d)
      );

      console.log(`  Category: ${result.mainCategory} (expected: ${tc.expectedCategory}) ${categoryMatch ? "✅" : "❌"}`);
      console.log(`  Subcategory: ${result.subcategory}`);
      console.log(`  Severity: ${result.severity.level} (score: ${result.severity.score})`);
      console.log(`  Priority: ${result.priority.band} (score: ${result.priority.score})`);
      console.log(`  Departments: [${result.departments.map((d) => d.code).join(", ")}] ${deptsFound ? "✅" : "❌"}`);
      console.log(`  Summary: ${result.summary}`);
      console.log(`  Confidence: ${(result.confidence.overall * 100).toFixed(0)}%`);
      console.log(`  Emergency: ${result.isEmergency ? "YES 🚨" : "No"}`);
      console.log(`  Questions: ${result.questionsForCitizen.length > 0 ? result.questionsForCitizen.map((q) => q.question).join("; ") : "None"}`);
      console.log(`  Time: ${result.processingTimeMs}ms`);

      if (categoryMatch && deptsFound) {
        passed++;
        console.log(`  Result: ✅ PASSED\n`);
      } else {
        failed++;
        console.log(`  Result: ❌ FAILED\n`);
      }
    } catch (err) {
      failed++;
      console.log(`  Error: ${err instanceof Error ? err.message : String(err)}`);
      console.log(`  Result: ❌ ERROR\n`);
    }
  }

  console.log("═══════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed out of ${TEST_CASES.length}`);
  console.log("═══════════════════════════════════════");

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
