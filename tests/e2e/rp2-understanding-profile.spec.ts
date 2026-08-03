import { expect, test } from "@playwright/test";

const apiBase = "";

test("RP2 profile: capture, freeze, ask one question, and answer it", async ({ page, request, browser }) => {
  test.setTimeout(45_000);
  let slug = "";
  let importedSlug = "";
  try {
    const created = await request.post(`${apiBase}/api/novel/projects`, {
      data: {
        title: `RP2 Profile ${Date.now()}`,
        genre: "profile-smoke",
        roughIdea: "A disposable project for the understanding profile journey."
      }
    });
    expect(created.ok()).toBeTruthy();
    slug = ((await created.json()) as { project: { slug: string } }).project.slug;

    await page.goto(`/projects/${slug}`);
    const input = page.getByLabel("Author input");
    await expect(input).toBeVisible();
    await input.fill("A lighthouse keeper wants to prove the drowned city is still alive.");
    await page.getByRole("button", { name: "Capture words" }).click();

    await expect(page.locator('[data-testid="understanding-preview"]')).toBeVisible();
    await page.getByRole("button", { name: "Freeze exact input for V2" }).click();
    await expect(page.locator(".manifest-state")).toContainText("T0 frozen");

    const budget = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/budget`, {
      data: { reservationId: `rp2-profile-${Date.now()}`, units: 100 }
    });
    expect(budget.ok()).toBeTruthy();
    const authorization = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/capability-authorization`, {
      data: { profileId: "codex-cli", modelId: "gpt-5-mini" }
    });
    expect(authorization.ok()).toBeTruthy();

    await page.getByTestId("prepare-question").click();
    await expect(page.getByTestId("dialogue-answer-form")).toBeVisible();
    await expect(page.getByTestId("dialogue-answer-form")).toContainText("want most");

    let answerUrl = "";
    let answerBody: Record<string, unknown> | undefined;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/session/understanding/questions/") && request.url().endsWith("/answers")) {
        answerUrl = request.url();
        answerBody = request.postDataJSON() as Record<string, unknown>;
      }
    });
    await page.getByTestId("dialogue-answer").fill("The keeper wants to prove the city survived beneath the tide.");
    await page.getByTestId("dialogue-answer-form").getByRole("button").click();
    await expect(page.locator(".session-error")).toHaveCount(0);
    expect(answerUrl).toContain(`/api/novel/projects/${slug}/session/understanding/questions/`);
    expect(answerBody?.idempotencyKey).toBeTruthy();
    const replay = await request.post(answerUrl, { data: answerBody });
    expect(replay.status()).toBe(200);
    expect(((await replay.json()) as { replayed?: boolean }).replayed).toBe(true);

    const decisions = await request.get(`${apiBase}/api/novel/projects/${slug}/session/understanding/decisions`);
    expect(decisions.ok()).toBeTruthy();
    const firstDecision = ((await decisions.json()) as { decisions: Array<{ decisionId: string }> }).decisions[0];
    expect(firstDecision?.decisionId).toBeTruthy();
    const manifest = await request.get(`${apiBase}/api/novel/projects/${slug}/session/context-manifest`);
    expect(manifest.ok()).toBeTruthy();
    const sourceFingerprint = ((await manifest.json()) as { manifest: { sourceFingerprint: string } }).manifest.sourceFingerprint;
    const remainingAnswers: Record<string, string> = {
      "question-core-conflict": "The keeper must oppose the council's denial of the living city.",
      "question-failure-cost": "If the keeper fails, the city disappears and the witness is blamed.",
      "question-inner-need": "The keeper needs to trust another witness.",
      "question-misbelief": "The keeper believes only solitary proof counts.",
      "question-world-rule": "The charged lens reveals the drowned city at low tide.",
      "question-opposing-pressure": "The tide and the council erase evidence before anyone believes it.",
      "question-irreversible-choice": "The keeper must share the lens and burn its final charge.",
      "question-reader-promise": "The story promises a costly revelation earned through trust.",
      "question-ending-direction": "The city is acknowledged, but the keeper loses the lens forever."
    };
    for (const [expectedQuestionId, answerText] of Object.entries(remainingAnswers)) {
      const questionResponse = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/questions`);
      expect([200, 201]).toContain(questionResponse.status());
      const questionBody = (await questionResponse.json()) as { question: { questionId: string; questionVersion: number } };
      expect(questionBody.question.questionId).toBe(expectedQuestionId);
      const answer = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/questions/${questionBody.question.questionId}/answers`, {
        data: {
          questionVersion: questionBody.question.questionVersion,
          expectedSnapshotFingerprint: sourceFingerprint,
          idempotencyKey: `rp3-profile-${expectedQuestionId}-${Date.now()}`,
          answerText,
          answerStatus: "confirmed"
        }
      });
      expect([200, 201]).toContain(answer.status());
    }
    const allDecisions = await request.get(`${apiBase}/api/novel/projects/${slug}/session/understanding/decisions`);
    expect(allDecisions.ok()).toBeTruthy();
    const decision = ((await allDecisions.json()) as { decisions: Array<{ decisionId: string }> }).decisions.at(-1);
    expect(decision?.decisionId).toBeTruthy();
    const contractCandidate = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/contract-candidates`, {
      data: { decisionId: decision.decisionId }
    });
    expect([200, 201]).toContain(contractCandidate.status());
    const candidate = ((await contractCandidate.json()) as { candidate: { candidateId: string; fingerprint: string; status: string; canonWritten: boolean; fields: Array<{ fieldId: string; path: string }> } }).candidate;
    expect(candidate).toMatchObject({
      status: "candidate",
      canonWritten: false
    });
    expect(candidate.fields.map((field) => field.path)).toEqual(expect.arrayContaining(Object.keys(remainingAnswers).map((questionId) => ({
      "question-inner-need": "protagonist.innerNeed",
      "question-misbelief": "protagonist.misbelief",
      "question-world-rule": "world.rules.primary",
      "question-core-conflict": "conflict.core",
      "question-opposing-pressure": "conflict.opposingPressure",
      "question-failure-cost": "stakes.failureCost",
      "question-irreversible-choice": "stakes.irreversibleChoice",
      "question-reader-promise": "readerPromise",
      "question-ending-direction": "endingDirection"
    } as Record<string, string>)[questionId])));
    expect(candidate.fields).toHaveLength(10);
    const contractReplay = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/contract-candidates`, {
      data: { decisionId: decision.decisionId }
    });
    expect(contractReplay.status()).toBe(200);

    const review = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/review`, {
      data: { reviewerId: "rp3-profile-independent" }
    });
    expect(review.status()).toBe(201);
    expect(((await review.json()) as { review: { status: string; canonWritten: boolean } }).review).toMatchObject({ status: "passed", canonWritten: false });
    const worldRule = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/world-rule-contracts`, {
      data: {
        sourceCandidateId: candidate.candidateId,
        sourceFingerprint: candidate.fingerprint,
        proposition: {
          condition: "The keeper carries a charged lighthouse lens.",
          mechanism: "The lens reveals submerged structures at low tide.",
          result: "The drowned city becomes observable for one scene.",
          cost: "The lens burns out after the reveal.",
          limit: "Only one reveal per tide cycle.",
          failure: "An uncharged lens produces a false shoreline."
        },
        scope: { subjects: ["lighthouse-keeper"], regions: ["north-shore"] },
        disclosure: { objectiveStatus: "proposed", domains: [{ domainId: "author", kind: "author_proposal", claim: "The lens reveals the city." }] },
        evidenceRefs: [{ kind: "decision-record", refId: decision.decisionId }]
      }
    });
    expect(worldRule.status()).toBe(201);
    const worldRuleBody = (await worldRule.json()) as { contract: { ruleId: string; status: string; canonWritten: boolean } };
    expect(worldRuleBody.contract).toMatchObject({ status: "candidate", canonWritten: false });
    const staleLink = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/contract-adoption-proposals`, {
      data: { candidateId: candidate.candidateId, expectedCandidateFingerprint: "b".repeat(64), worldRuleContractId: worldRuleBody.contract.ruleId, fieldDecisions: candidate.fields.map((field) => ({ fieldId: field.fieldId, status: "accept" })) }
    });
    expect(staleLink.status()).toBe(409);
    expect(((await staleLink.json()) as { error: { code: string } }).error.code).toBe("CANDIDATE_FINGERPRINT_STALE");
    const proposal = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/contract-adoption-proposals`, {
      data: {
        candidateId: candidate.candidateId,
        expectedCandidateFingerprint: candidate.fingerprint,
        worldRuleContractId: worldRuleBody.contract.ruleId,
        fieldDecisions: candidate.fields.map((field) => ({ fieldId: field.fieldId, status: "accept", reason: "author profile acceptance" }))
      }
    });
    expect(proposal.status()).toBe(201);
    const proposalBody = (await proposal.json()) as { proposal: { fingerprint: string; status: string } };
    expect(proposalBody.proposal.status).toBe("ready_for_authorization");
    const adoption = await request.post(`${apiBase}/api/novel/projects/${slug}/session/understanding/contract-adoption`, {
      data: { expectedProposalFingerprint: proposalBody.proposal.fingerprint, authorization: { actorId: "author", authorizationId: "rp3-profile-acceptance" } }
    });
    expect(adoption.status()).toBe(201);
    expect(((await adoption.json()) as { status: string }).status).toBe("committed");

    const characterContract = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/character-contracts`, {
      data: {
        characterId: "keeper",
        displayName: "Lighthouse Keeper",
        externalWant: "Prove the drowned city is alive.",
        internalNeed: "Trust another witness.",
        falseBelief: "Only solitary proof counts.",
        woundOrFear: "Being dismissed again.",
        valuesAndBoundaries: ["protect the shoreline"],
        contradiction: "Demands proof while hiding evidence.",
        stake: "The city disappears if nobody believes.",
        unacceptableChoice: "Abandon the last witness.",
        potentialChange: "Accepts shared testimony.",
        unknown: ["What the city wants"],
        sources: [{ field: "externalWant", provenance: "author-confirmed", sourceVersion: sourceFingerprint, evidenceRefs: [`decision://${decision.decisionId}`] }]
      }
    });
    expect(characterContract.status()).toBe(201);
    const character = (await characterContract.json()) as { contract: { contractId: string; lifecycle: string } };
    expect(character.contract.lifecycle).toBe("candidate");
    const confirmedCharacter = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/character-contracts/${character.contract.contractId}/confirm`, {
      data: { actor: "author", reason: "Confirm the protagonist boundary for RP3." }
    });
    expect(confirmedCharacter.status()).toBe(200);
    expect(((await confirmedCharacter.json()) as { contract: { lifecycle: string } }).contract.lifecycle).toBe("confirmed");

    const worldState = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/world-state-snapshots`, {
      data: {
        asOf: "chapter-001",
        region: "north-shore",
        publicationVersion: "rp3-profile-canon-1",
        politicalControl: ["shore council"],
        activeConflicts: ["city denial"],
        institutions: ["lighthouse guild"],
        infrastructure: ["drowned beacon"],
        markets: [],
        environment: ["low tide"],
        resources: ["charged lens"],
        effectiveRuleIds: [worldRuleBody.contract.ruleId],
        unknowns: ["whether the city can answer"],
        sourceRefs: [`decision://${decision.decisionId}`]
      }
    });
    expect(worldState.status()).toBe(201);
    const worldStateBody = (await worldState.json()) as { snapshot: { snapshotId: string; region: string; effectiveRuleIds: string[] } };
    expect(worldStateBody.snapshot).toMatchObject({ region: "north-shore", effectiveRuleIds: [worldRuleBody.contract.ruleId] });
    const worldStateProjection = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/world-state-projection`, {
      data: { snapshots: [worldStateBody.snapshot], region: "north-shore", asOf: "chapter-001", publicationVersion: "rp3-profile-canon-1" }
    });
    expect(worldStateProjection.ok()).toBeTruthy();

    const location = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/world-locations`, {
      data: {
        locationId: "lighthouse",
        name: "Drowned Beacon",
        hierarchy: "coast > north-shore > beacon",
        region: "north-shore",
        travelRoutes: [{ toLocationId: "drowned-city", distance: "two miles", travelMode: "tidal path", normalDuration: "one tide", blockedDuration: "until next tide", accessConditions: ["low tide"], risks: ["sinkhole"] }],
        accessConditions: ["charged lens", "low tide"],
        currentReachability: "reachable",
        sourceRefs: [`decision://${decision.decisionId}`]
      }
    });
    expect(location.status()).toBe(201);
    const locationBody = (await location.json()) as { location: { locationId: string } };
    const reachability = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/world-locations/${locationBody.location.locationId}/reachability`, {
      data: { destinationId: "drowned-city", hasAccess: true }
    });
    expect(reachability.ok()).toBeTruthy();
    expect(((await reachability.json()) as { status: string }).status).toBe("reachable");
    const travel = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/world-travel`, {
      data: { fromLocationId: "lighthouse", toLocationId: "drowned-city", actorId: "keeper", mode: "tidal path", evidenceRefs: [`chapter://${worldStateBody.snapshot.snapshotId}`] }
    });
    expect(travel.status()).toBe(201);
    expect(((await travel.json()) as { travel: { kind: string; duration: string } }).travel).toMatchObject({ kind: "travel", duration: "one tide" });

    const capability = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/capability-contracts`, {
      data: {
        holderId: "keeper",
        name: "drowned-city-lens",
        sourceRefs: [`decision://${decision.decisionId}`],
        canDo: "Reveal the drowned city at low tide.",
        cannotDo: ["Reveal it inland."],
        prerequisites: ["charged lens"],
        inputs: ["lens", "low tide"],
        consumption: ["lens charge", "shortness of breath"],
        scope: ["north-shore"],
        duration: "one scene",
        cooldown: "one tide cycle",
        precision: "shoreline coordinates",
        counters: ["false shoreline"],
        progressionPath: ["learn tide geometry"],
        disclosure: "author proposal",
        evidenceRefs: [`chapter://${worldStateBody.snapshot.snapshotId}`]
      }
    });
    expect(capability.status()).toBe(201);
    const capabilityBody = (await capability.json()) as { capability: { capabilityId: string; status: string; permanent: boolean } };
    expect(capabilityBody.capability).toMatchObject({ status: "candidate", permanent: false });
    const progression = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/capability-contracts/${capabilityBody.capability.capabilityId}/progression`, {
      data: { trigger: "the keeper shares the lens", acquisition: "tide geometry learned", acquisitionKind: "discovery", retained: "one safer reveal", abandoned: "solitary proof", limitation: "still needs low tide", newChoice: "trust the witness", proseRefs: [`chapter://${worldStateBody.snapshot.snapshotId}`], sourceRefs: [`decision://${decision.decisionId}`] }
    });
    expect(progression.status()).toBe(201);
    expect(((await progression.json()) as { event: { acquisitionKind: string } }).event.acquisitionKind).toBe("discovery");

    const beforeState = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/character-state-snapshots`, {
      data: {
        characterId: "keeper",
        contractId: character.contract.contractId,
        asOf: "chapter-001",
        currentGoal: "Prove the city is alive.",
        priority: "Find a witness.",
        belief: "Proof must be solitary.",
        knowledge: ["the lens works"],
        emotion: "afraid",
        injury: "none",
        resources: ["charged lens"],
        abilitiesAndIdentity: ["lighthouse keeper"],
        relationshipStances: [{ targetCharacterId: "witness", trust: 0, intimacy: 0, power: 1, dependency: 0, fear: 1, responsibility: 0, publicStance: "guarded", privateStance: "alone", boundary: "no shared proof", unpaidDebt: "none" }],
        obligations: ["protect the shoreline"],
        availableChoices: ["trust witness", "hide lens"],
        sourceRefs: [`chapter://${worldStateBody.snapshot.snapshotId}`]
      }
    });
    expect(beforeState.status()).toBe(201);
    const beforeStateBody = (await beforeState.json()) as { snapshot: { snapshotId: string } };
    const afterState = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/character-state-snapshots`, {
      data: {
        characterId: "keeper",
        contractId: character.contract.contractId,
        asOf: "chapter-002",
        currentGoal: "Let the witness see the city.",
        priority: "Protect shared evidence.",
        belief: "Shared proof can survive.",
        knowledge: ["the lens works", "the witness believes"],
        emotion: "resolved",
        injury: "burned hand",
        resources: ["spent lens"],
        abilitiesAndIdentity: ["lighthouse keeper", "trusted witness"],
        relationshipStances: [{ targetCharacterId: "witness", trust: 1, intimacy: 1, power: 0, dependency: 1, fear: 0, responsibility: 1, publicStance: "allied", privateStance: "trusting", boundary: "share the lens", unpaidDebt: "protect the witness" }],
        obligations: ["protect the shoreline", "keep the witness safe"],
        availableChoices: ["return to the beacon"],
        sourceRefs: [`chapter://${worldStateBody.snapshot.snapshotId}`]
      }
    });
    expect(afterState.status()).toBe(201);
    const afterStateBody = (await afterState.json()) as { snapshot: { snapshotId: string } };
    const choiceEvidence = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/character-choice-evidence`, {
      data: { characterId: "keeper", contractId: character.contract.contractId, beforeSnapshotId: beforeStateBody.snapshot.snapshotId, choice: "trust witness", rejectedChoices: ["hide lens"], immediateCost: "burned hand", delayedCost: "the city notices", evidenceRefs: [`chapter://${beforeStateBody.snapshot.snapshotId}`] }
    });
    expect(choiceEvidence.status()).toBe(201);
    const choiceBody = (await choiceEvidence.json()) as { evidence: { evidenceId: string; status: string } };
    expect(choiceBody.evidence.status).toBe("planned");
    const observedChoice = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/character-choice-evidence/${choiceBody.evidence.evidenceId}/observe`, {
      data: { afterSnapshotId: afterStateBody.snapshot.snapshotId, outcomeRefs: [`chapter://${afterStateBody.snapshot.snapshotId}`] }
    });
    expect(observedChoice.status()).toBe(200);
    expect(((await observedChoice.json()) as { evidence: { status: string } }).evidence.status).toBe("observed");
    const agency = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/character-agency/guard`, {
      data: {
        eventId: `agency-${choiceBody.evidence.evidenceId}`,
        characterId: "keeper",
        outcome: "The witness sees the drowned city.",
        choiceEvidenceIds: [choiceBody.evidence.evidenceId],
        causalFactors: [{ kind: "character-choice", description: "The keeper chooses to trust the witness.", evidenceRefs: [`choice://${choiceBody.evidence.evidenceId}`] }],
        sourceRefs: [`chapter://${afterStateBody.snapshot.snapshotId}`]
      }
    });
    expect(agency.ok()).toBeTruthy();
    expect(((await agency.json()) as { status: string }).status).toBe("passed");
    const agencyWithoutChoice = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/character-agency/guard`, {
      data: {
        eventId: `agency-missing-choice-${choiceBody.evidence.evidenceId}`,
        characterId: "keeper",
        outcome: "The city appears by coincidence.",
        choiceEvidenceIds: [],
        causalFactors: [{ kind: "external-force", description: "The tide exposes the city.", evidenceRefs: [`chapter://${afterStateBody.snapshot.snapshotId}`] }],
        sourceRefs: [`chapter://${afterStateBody.snapshot.snapshotId}`]
      }
    });
    expect(agencyWithoutChoice.ok()).toBeTruthy();
    expect(((await agencyWithoutChoice.json()) as { status: string; issues: string[] })).toMatchObject({ status: "blocked", issues: expect.arrayContaining(["AGENCY_CHOICE_MISSING", "AGENCY_EXTERNAL_SUBSTITUTION"]) });

    const belief = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/character-beliefs`, {
      data: { beliefId: "belief-solitary-proof", characterId: "keeper", belief: "Only solitary proof counts.", protectiveFunction: "prevents abandonment", sourceRefs: [`decision://${decision.decisionId}`] }
    });
    expect(belief.status()).toBe(201);
    let beliefRecord = (await belief.json()) as { status: string; events: unknown[] };
    expect(beliefRecord.status).toBe("held");
    const beliefChallenge = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/character-beliefs/events`, {
      data: { record: beliefRecord, type: "counterevidence", description: "The witness preserves the proof.", evidenceRefs: [`chapter://${afterStateBody.snapshot.snapshotId}`] }
    });
    expect(beliefChallenge.ok()).toBeTruthy();
    beliefRecord = (await beliefChallenge.json()) as typeof beliefRecord;
    expect(beliefRecord.status).toBe("challenged");
    const beliefBehavior = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/character-beliefs/events`, {
      data: { record: beliefRecord, type: "behavioral-consequence", description: "The keeper lets the witness hold the lens.", evidenceRefs: [`chapter://${afterStateBody.snapshot.snapshotId}`] }
    });
    expect(beliefBehavior.ok()).toBeTruthy();
    beliefRecord = (await beliefBehavior.json()) as typeof beliefRecord;
    const beliefAcknowledged = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/character-beliefs/events`, {
      data: { record: beliefRecord, type: "acknowledged", description: "The keeper admits shared proof is possible.", evidenceRefs: [`chapter://${afterStateBody.snapshot.snapshotId}`] }
    });
    expect(beliefAcknowledged.ok()).toBeTruthy();
    expect(((await beliefAcknowledged.json()) as { status: string }).status).toBe("acknowledged");

    const misread = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/relationship-misreads`, {
      data: { relationshipId: "keeper-witness", sourceCharacterId: "keeper", targetCharacterId: "witness", sourceDefinition: "A liability", targetDefinition: "A reluctant ally", publicState: "guarded", sourceSecret: "fear of dismissal", targetSecret: "already believes", misunderstanding: "Silence is mistaken for rejection", sourceRefs: [`decision://${decision.decisionId}`] }
    });
    const misreadPayload = await misread.text();
    expect(misread.status(), misreadPayload).toBe(201);
    const misreadRecord = JSON.parse(misreadPayload) as { status: string; relationshipRestored: boolean };
    expect(misreadRecord).toMatchObject({ status: "unresolved", relationshipRestored: false });
    const clarifiedMisread = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/relationship-misreads/resolve`, {
      data: { record: misreadRecord, sourceInterpretation: "The witness was protecting the proof.", targetInterpretation: "The keeper needed an invitation.", evidenceRefs: [`chapter://${afterStateBody.snapshot.snapshotId}`], compensationProvided: false }
    });
    expect(clarifiedMisread.ok()).toBeTruthy();
    expect(((await clarifiedMisread.json()) as { status: string; relationshipRestored: boolean })).toMatchObject({ status: "clarified-unrepaired", relationshipRestored: false });

    const relationshipEvent = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/relationship-events`, {
      data: {
        relationshipId: "keeper-witness",
        sourceCharacterId: "keeper",
        targetCharacterId: "witness",
        contractId: character.contract.contractId,
        beforeSnapshotId: beforeStateBody.snapshot.snapshotId,
        sharedEventRef: `chapter://${afterStateBody.snapshot.snapshotId}`,
        sourceCharacterChoice: "trust witness",
        targetCharacterChoice: "hold the lens",
        sourceInterpretation: "A liability",
        targetInterpretation: "A reluctant ally",
        visibleActions: ["the keeper shares the lens"],
        valueExchange: "proof for protection",
        immediateCost: "burned hand",
        delayedCost: "the council notices",
        evidenceRefs: [`chapter://${afterStateBody.snapshot.snapshotId}`]
      }
    });
    expect(relationshipEvent.status()).toBe(201);
    const relationshipEventBody = (await relationshipEvent.json()) as { event: { eventId: string; status: string } };
    expect(relationshipEventBody.event.status).toBe("planned");
    const observedRelationship = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/relationship-events/${relationshipEventBody.event.eventId}/observe`, {
      data: { afterSnapshotId: afterStateBody.snapshot.snapshotId, outcomeRefs: [`chapter://${afterStateBody.snapshot.snapshotId}`] }
    });
    expect(observedRelationship.status()).toBe(200);
    expect(((await observedRelationship.json()) as { event: { status: string; relationshipChangedDimensions: string[] } }).event).toMatchObject({ status: "observed", relationshipChangedDimensions: expect.arrayContaining(["trust", "publicStance"]) });

    await page.reload();
    await expect(page.locator(".session-messages")).toContainText("lighthouse keeper");
    await expect(page.getByTestId("dialogue-answer-form")).toHaveCount(0);
    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    await secondPage.goto(`/projects/${slug}`);
    await expect(secondPage.locator(".session-messages")).toContainText("lighthouse keeper");
    await expect(secondPage.locator('[data-testid="dialogue-answer-form"]')).toHaveCount(0);
    const resumeBrief = await secondPage.evaluate(async (projectSlug) => {
      const response = await fetch(`/api/novel/projects/${projectSlug}/session/resume-brief`);
      return await response.json() as { brief: { schemaVersion: string; projectSlug: string; sourceRefs: string[]; recommendedNextStep: string } };
    }, slug);
    expect(resumeBrief.brief).toMatchObject({ schemaVersion: "author-resume-brief.v1", projectSlug: slug, recommendedNextStep: "continue" });
    expect(resumeBrief.brief.sourceRefs.some((ref) => ref.startsWith(`session://session-${slug}@`))).toBe(true);
    const retryMessageId = `cross-device-retry-${Date.now()}`;
    await secondPage.route(`**/api/novel/projects/${slug}/session/messages`, async (route) => route.abort("internetdisconnected"));
    const interrupted = await secondPage.evaluate(async ({ projectSlug, clientMessageId }) => {
      try {
        await fetch(`/api/novel/projects/${projectSlug}/session/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId, text: "A network interruption must not duplicate this message." }) });
        return { failed: false };
      } catch {
        return { failed: true };
      }
    }, { projectSlug: slug, clientMessageId: retryMessageId });
    expect(interrupted.failed).toBe(true);
    await secondPage.unroute(`**/api/novel/projects/${slug}/session/messages`);
    const retried = await secondPage.evaluate(async ({ projectSlug, clientMessageId }) => {
      const response = await fetch(`/api/novel/projects/${projectSlug}/session/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId, text: "A network interruption must not duplicate this message." }) });
      return { status: response.status, body: await response.json() as { created: boolean } };
    }, { projectSlug: slug, clientMessageId: retryMessageId });
    expect(retried.status).toBe(201);
    expect(retried.body.created).toBe(true);
    const replayed = await secondPage.evaluate(async ({ projectSlug, clientMessageId }) => {
      const response = await fetch(`/api/novel/projects/${projectSlug}/session/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId, text: "A different body must not overwrite the original." }) });
      return { status: response.status, body: await response.json() as { created: boolean; session: { messages: Array<{ clientMessageId: string }> } } };
    }, { projectSlug: slug, clientMessageId: retryMessageId });
    expect(replayed.status).toBe(200);
    expect(replayed.body.created).toBe(false);
    expect(replayed.body.session.messages.filter((message) => message.clientMessageId === retryMessageId)).toHaveLength(1);
    await secondContext.close();

    // Legacy cockpit panel and runtime worker entry must remain usable through
    // the same project command boundary and preserve idempotency on retries.
    const dashboard = await request.put(`${apiBase}/api/novel/projects/${slug}/dashboard/chapter-001`, {
      data: { dashboard: { chapterId: "chapter-001", goal: "Preserve the drowned-city mystery", wordCount: 0 } }
    });
    expect(dashboard.ok()).toBeTruthy();
    const dashboardRead = await request.get(`${apiBase}/api/novel/projects/${slug}/dashboard/chapter-001`);
    expect(dashboardRead.ok()).toBeTruthy();
    expect(((await dashboardRead.json()) as { dashboard: { goal: string } }).dashboard.goal).toContain("drowned-city");

    const runtimeStart = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/start`, {
      data: { chapterId: "chapter-001", idempotencyKey: `rp2-profile-runtime-start-${slug}` }
    });
    expect(runtimeStart.status()).toBe(202);
    const runtimePayload = (await runtimeStart.json()) as { run: { id: string }; command: { id: string; status: string } };
    expect(runtimePayload.command).toMatchObject({ status: "pending" });
    const runtimeReplay = await request.post(`${apiBase}/api/novel/projects/${slug}/runtime/start`, {
      data: { chapterId: "chapter-001", idempotencyKey: `rp2-profile-runtime-start-${slug}` }
    });
    expect(runtimeReplay.status()).toBe(202);
    expect(((await runtimeReplay.json()) as { command: { id: string } }).command.id).toBe(runtimePayload.command.id);

    const imported = await request.post(`${apiBase}/api/novel/import`, {
      data: {
        sourcePath: "rp2-profile-import",
        title: `RP2 Imported ${Date.now()}`,
        files: [{ relativePath: "rp2-profile-import/chapter-001.md", content: "# Imported Gate\n\nA preserved legacy chapter." }]
      }
    });
    expect(imported.status()).toBe(201);
    importedSlug = ((await imported.json()) as { project: { slug: string } }).project.slug;
    const importedReport = await request.get(`${apiBase}/api/novel/projects/${importedSlug}/files/imports/import-report.json`);
    expect(importedReport.ok()).toBeTruthy();
    expect(((await importedReport.json()) as { content: string }).content).toContain("rp2-profile-import");
    const importedMigrationPreview = await request.post(`${apiBase}/api/novel/projects/${importedSlug}/migrations`, { data: {} });
    expect(importedMigrationPreview.status()).toBe(200);
    const importedMigration = (await importedMigrationPreview.json()) as { preview: { migrationId: string; status: string; previewOnly: boolean; assetCounts: { chapters: number } } };
    expect(importedMigration.preview).toMatchObject({ status: "preview_only", previewOnly: true });
    expect(importedMigration.preview.assetCounts.chapters).toBeGreaterThanOrEqual(1);
    const importedMigrationValidation = await request.post(`${apiBase}/api/novel/projects/${importedSlug}/migrations/${importedMigration.preview.migrationId}/validate`, { data: {} });
    expect(importedMigrationValidation.status()).toBe(200);
    expect(((await importedMigrationValidation.json()) as { validation: { dependencies: { outlineVersion: string } } }).validation.dependencies.outlineVersion).toBe("missing");

    const questions = await request.get(`${apiBase}/api/novel/projects/${slug}/session/understanding/questions`);
    expect(questions.ok()).toBeTruthy();
    expect(((await questions.json()) as { questions: Array<{ status: string }> }).questions).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "answered" })])
    );
  } finally {
    if (slug) {
      const deleted = await request.delete(`${apiBase}/api/novel/projects/${slug}`);
      expect([200, 204, 404]).toContain(deleted.status());
    }
    if (importedSlug) {
      const deleted = await request.delete(`${apiBase}/api/novel/projects/${importedSlug}`);
      expect([200, 204, 404]).toContain(deleted.status());
    }
  }
});
