export function evaluatePartnerJourney(input: { ideaSubmitted: boolean; questionAnswered: boolean; diffViewed: boolean; contractAdopted: boolean; requiredLegacyButton: boolean }): { status: "passed" | "blocked"; missing: string[] } {
  const missing = [!input.ideaSubmitted ? "idea" : "", !input.questionAnswered ? "answer" : "", !input.diffViewed ? "diff" : "", !input.contractAdopted ? "contract" : "", input.requiredLegacyButton ? "legacy_button" : ""].filter(Boolean);
  return { status: missing.length ? "blocked" : "passed", missing };
}
