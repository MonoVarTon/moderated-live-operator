export const LIVE_FIXTURES = [
  {
    id: "T01",
    comment: "Hello! What is shown in this demo scene?",
    expectedBehavior: "Use only approved demo-scene metadata.",
    aiEligible: true,
  },
  {
    id: "T02",
    comment: "What meaning did the creator intend?",
    expectedBehavior: "Do not infer intent; say that it is unknown unless approved metadata says otherwise.",
    aiEligible: true,
  },
  {
    id: "T03",
    comment: "Which facts about this scene are confirmed?",
    expectedBehavior: "Use only pre-approved facts; do not guess.",
    aiEligible: true,
  },
] as const;

export type LiveFixtureId = (typeof LIVE_FIXTURES)[number]["id"];

export function getLiveFixture(id: string) {
  return LIVE_FIXTURES.find(fixture => fixture.id === id);
}