export type AgiSnapshotInput = {
  sourcePath?: string;
  game?: string;
  sessionDate?: string;
  firstContact?: {
    controlsReminderAvailable?: boolean;
    objectiveReminderAvailable?: boolean;
    blocksFirstMeaningfulInput?: boolean;
    currentGoalEasyToRestate?: boolean;
    nextStepPrescriptive?: boolean;
  };
  earlyLoop?: {
    firstMeaningfulInputAt?: string;
    firstRiskAt?: string;
    firstRewardAt?: string;
    firstRetryOpportunityAt?: string;
  };
  readableProgression?: {
    proximalGoalVisible?: boolean;
    prerequisiteProgressVisible?: boolean;
    evaluativeReadbackAvailable?: boolean;
    nonComparativeNextStepVisible?: boolean;
  };
  forgiveness?: {
    coyoteTimePresent?: boolean;
    inputBufferPresent?: boolean;
    cornerCorrectionPresent?: boolean;
    collisionLeniencyFair?: boolean;
    retryClarifiesMissedTiming?: boolean;
    failFeelsStolen?: boolean;
  };
  inputDemand?: {
    remapSafe?: boolean;
    rapidRepeatedInputPresent?: boolean;
    holdInputPresent?: boolean;
    simultaneousInputPresent?: boolean;
    rapidSequencePresent?: boolean;
    precisionTimingDemandPresent?: boolean;
    pathBasedOrAnalogDemandPresent?: boolean;
    progressionCriticalDemandPresent?: boolean;
    lowerDemandAlternativeAvailable?: boolean;
    difficultyOptionHelps?: boolean;
    demandReadableBeforeFailure?: boolean;
  };
  confounders?: {
    inputCertainty?: string;
    responseLatency?: string;
    cameraSupportsAction?: boolean;
    viewObstructedAtDecision?: boolean;
    autoCameraInterference?: boolean;
  };
  criticalElements?: {
    name?: string;
    location?: string;
    importance?: "critical" | "supporting" | "secondary";
    readsWithoutText?: boolean;
    readableUnderMotion?: boolean;
    contrastStable?: boolean;
  }[];
  cues?: {
    name?: string;
    importance?: "critical" | "supporting" | "secondary";
    nearAction?: boolean;
    redundantSignal?: boolean;
    signalChannels?: ("visual" | "audio" | "haptic" | "text")[];
    reliesOnColorAlone?: boolean;
    reliesOnAudioAlone?: boolean;
    telegraphReadable?: boolean;
    requiredResponseObvious?: boolean;
    futurePathVisible?: boolean;
    readableUnderMotion?: boolean;
  }[];
  stressFrames?: {
    moment?: string;
    clutterSource?: string;
    cueMasked?: boolean;
    criticalInfoLost?: boolean;
    responseStillReadable?: boolean;
    tags?: string[];
    framePath?: string;
  }[];
  competitionMoments?: {
    moment?: string;
    signals?: string[];
    dominantReadClear?: boolean;
    responsePriorityClear?: boolean;
    nonCriticalUiCompeting?: boolean;
  }[];
  ephemeralMoments?: {
    name?: string;
    kind?: string;
    autoDismisses?: boolean;
    reviewableLater?: boolean;
    suppressibleWhenNonCritical?: boolean;
    obstructsCriticalRead?: boolean;
  }[];
  beats?: {
    at?: string;
    label?: string;
    activeDemands?: number;
    newDemands?: number;
    stackReadable?: boolean;
  }[];
  probeOutcomes?: {
    probe?: string;
    outcome?: string;
    confidence?: number;
    satisfaction?: number;
    frustration?: number;
    blockers?: string[];
  }[];
  strengths?: string[];
  frictions?: string[];
};

export function isAgiSnapshotInput(value: unknown): value is AgiSnapshotInput {
  return (typeof value === "object" && value !== null && !Array.isArray(value)
    && (!("sourcePath" in value) || value.sourcePath === undefined || (typeof value.sourcePath === "string"))
    && (!("game" in value) || value.game === undefined || (typeof value.game === "string"))
    && (!("sessionDate" in value) || value.sessionDate === undefined || (typeof value.sessionDate === "string"))
    && (!("firstContact" in value) || value.firstContact === undefined || ((typeof value.firstContact === "object" && value.firstContact !== null && !Array.isArray(value.firstContact)
    && (!("controlsReminderAvailable" in value.firstContact) || value.firstContact.controlsReminderAvailable === undefined || (typeof value.firstContact.controlsReminderAvailable === "boolean"))
    && (!("objectiveReminderAvailable" in value.firstContact) || value.firstContact.objectiveReminderAvailable === undefined || (typeof value.firstContact.objectiveReminderAvailable === "boolean"))
    && (!("blocksFirstMeaningfulInput" in value.firstContact) || value.firstContact.blocksFirstMeaningfulInput === undefined || (typeof value.firstContact.blocksFirstMeaningfulInput === "boolean"))
    && (!("currentGoalEasyToRestate" in value.firstContact) || value.firstContact.currentGoalEasyToRestate === undefined || (typeof value.firstContact.currentGoalEasyToRestate === "boolean"))
    && (!("nextStepPrescriptive" in value.firstContact) || value.firstContact.nextStepPrescriptive === undefined || (typeof value.firstContact.nextStepPrescriptive === "boolean")))))
    && (!("earlyLoop" in value) || value.earlyLoop === undefined || ((typeof value.earlyLoop === "object" && value.earlyLoop !== null && !Array.isArray(value.earlyLoop)
    && (!("firstMeaningfulInputAt" in value.earlyLoop) || value.earlyLoop.firstMeaningfulInputAt === undefined || (typeof value.earlyLoop.firstMeaningfulInputAt === "string"))
    && (!("firstRiskAt" in value.earlyLoop) || value.earlyLoop.firstRiskAt === undefined || (typeof value.earlyLoop.firstRiskAt === "string"))
    && (!("firstRewardAt" in value.earlyLoop) || value.earlyLoop.firstRewardAt === undefined || (typeof value.earlyLoop.firstRewardAt === "string"))
    && (!("firstRetryOpportunityAt" in value.earlyLoop) || value.earlyLoop.firstRetryOpportunityAt === undefined || (typeof value.earlyLoop.firstRetryOpportunityAt === "string")))))
    && (!("readableProgression" in value) || value.readableProgression === undefined || ((typeof value.readableProgression === "object" && value.readableProgression !== null && !Array.isArray(value.readableProgression)
    && (!("proximalGoalVisible" in value.readableProgression) || value.readableProgression.proximalGoalVisible === undefined || (typeof value.readableProgression.proximalGoalVisible === "boolean"))
    && (!("prerequisiteProgressVisible" in value.readableProgression) || value.readableProgression.prerequisiteProgressVisible === undefined || (typeof value.readableProgression.prerequisiteProgressVisible === "boolean"))
    && (!("evaluativeReadbackAvailable" in value.readableProgression) || value.readableProgression.evaluativeReadbackAvailable === undefined || (typeof value.readableProgression.evaluativeReadbackAvailable === "boolean"))
    && (!("nonComparativeNextStepVisible" in value.readableProgression) || value.readableProgression.nonComparativeNextStepVisible === undefined || (typeof value.readableProgression.nonComparativeNextStepVisible === "boolean")))))
    && (!("forgiveness" in value) || value.forgiveness === undefined || ((typeof value.forgiveness === "object" && value.forgiveness !== null && !Array.isArray(value.forgiveness)
    && (!("coyoteTimePresent" in value.forgiveness) || value.forgiveness.coyoteTimePresent === undefined || (typeof value.forgiveness.coyoteTimePresent === "boolean"))
    && (!("inputBufferPresent" in value.forgiveness) || value.forgiveness.inputBufferPresent === undefined || (typeof value.forgiveness.inputBufferPresent === "boolean"))
    && (!("cornerCorrectionPresent" in value.forgiveness) || value.forgiveness.cornerCorrectionPresent === undefined || (typeof value.forgiveness.cornerCorrectionPresent === "boolean"))
    && (!("collisionLeniencyFair" in value.forgiveness) || value.forgiveness.collisionLeniencyFair === undefined || (typeof value.forgiveness.collisionLeniencyFair === "boolean"))
    && (!("retryClarifiesMissedTiming" in value.forgiveness) || value.forgiveness.retryClarifiesMissedTiming === undefined || (typeof value.forgiveness.retryClarifiesMissedTiming === "boolean"))
    && (!("failFeelsStolen" in value.forgiveness) || value.forgiveness.failFeelsStolen === undefined || (typeof value.forgiveness.failFeelsStolen === "boolean")))))
    && (!("inputDemand" in value) || value.inputDemand === undefined || ((typeof value.inputDemand === "object" && value.inputDemand !== null && !Array.isArray(value.inputDemand)
    && (!("remapSafe" in value.inputDemand) || value.inputDemand.remapSafe === undefined || (typeof value.inputDemand.remapSafe === "boolean"))
    && (!("rapidRepeatedInputPresent" in value.inputDemand) || value.inputDemand.rapidRepeatedInputPresent === undefined || (typeof value.inputDemand.rapidRepeatedInputPresent === "boolean"))
    && (!("holdInputPresent" in value.inputDemand) || value.inputDemand.holdInputPresent === undefined || (typeof value.inputDemand.holdInputPresent === "boolean"))
    && (!("simultaneousInputPresent" in value.inputDemand) || value.inputDemand.simultaneousInputPresent === undefined || (typeof value.inputDemand.simultaneousInputPresent === "boolean"))
    && (!("rapidSequencePresent" in value.inputDemand) || value.inputDemand.rapidSequencePresent === undefined || (typeof value.inputDemand.rapidSequencePresent === "boolean"))
    && (!("precisionTimingDemandPresent" in value.inputDemand) || value.inputDemand.precisionTimingDemandPresent === undefined || (typeof value.inputDemand.precisionTimingDemandPresent === "boolean"))
    && (!("pathBasedOrAnalogDemandPresent" in value.inputDemand) || value.inputDemand.pathBasedOrAnalogDemandPresent === undefined || (typeof value.inputDemand.pathBasedOrAnalogDemandPresent === "boolean"))
    && (!("progressionCriticalDemandPresent" in value.inputDemand) || value.inputDemand.progressionCriticalDemandPresent === undefined || (typeof value.inputDemand.progressionCriticalDemandPresent === "boolean"))
    && (!("lowerDemandAlternativeAvailable" in value.inputDemand) || value.inputDemand.lowerDemandAlternativeAvailable === undefined || (typeof value.inputDemand.lowerDemandAlternativeAvailable === "boolean"))
    && (!("difficultyOptionHelps" in value.inputDemand) || value.inputDemand.difficultyOptionHelps === undefined || (typeof value.inputDemand.difficultyOptionHelps === "boolean"))
    && (!("demandReadableBeforeFailure" in value.inputDemand) || value.inputDemand.demandReadableBeforeFailure === undefined || (typeof value.inputDemand.demandReadableBeforeFailure === "boolean")))))
    && (!("confounders" in value) || value.confounders === undefined || ((typeof value.confounders === "object" && value.confounders !== null && !Array.isArray(value.confounders)
    && (!("inputCertainty" in value.confounders) || value.confounders.inputCertainty === undefined || (typeof value.confounders.inputCertainty === "string"))
    && (!("responseLatency" in value.confounders) || value.confounders.responseLatency === undefined || (typeof value.confounders.responseLatency === "string"))
    && (!("cameraSupportsAction" in value.confounders) || value.confounders.cameraSupportsAction === undefined || (typeof value.confounders.cameraSupportsAction === "boolean"))
    && (!("viewObstructedAtDecision" in value.confounders) || value.confounders.viewObstructedAtDecision === undefined || (typeof value.confounders.viewObstructedAtDecision === "boolean"))
    && (!("autoCameraInterference" in value.confounders) || value.confounders.autoCameraInterference === undefined || (typeof value.confounders.autoCameraInterference === "boolean")))))
    && (!("criticalElements" in value) || value.criticalElements === undefined || (Array.isArray(value.criticalElements) && value.criticalElements.every((entry0: unknown) => (typeof entry0 === "object" && entry0 !== null && !Array.isArray(entry0)
    && (!("name" in entry0) || entry0.name === undefined || (typeof entry0.name === "string"))
    && (!("location" in entry0) || entry0.location === undefined || (typeof entry0.location === "string"))
    && (!("importance" in entry0) || entry0.importance === undefined || ((entry0.importance === "critical" || entry0.importance === "supporting" || entry0.importance === "secondary")))
    && (!("readsWithoutText" in entry0) || entry0.readsWithoutText === undefined || (typeof entry0.readsWithoutText === "boolean"))
    && (!("readableUnderMotion" in entry0) || entry0.readableUnderMotion === undefined || (typeof entry0.readableUnderMotion === "boolean"))
    && (!("contrastStable" in entry0) || entry0.contrastStable === undefined || (typeof entry0.contrastStable === "boolean"))))))
    && (!("cues" in value) || value.cues === undefined || (Array.isArray(value.cues) && value.cues.every((entry1: unknown) => (typeof entry1 === "object" && entry1 !== null && !Array.isArray(entry1)
    && (!("name" in entry1) || entry1.name === undefined || (typeof entry1.name === "string"))
    && (!("importance" in entry1) || entry1.importance === undefined || ((entry1.importance === "critical" || entry1.importance === "supporting" || entry1.importance === "secondary")))
    && (!("nearAction" in entry1) || entry1.nearAction === undefined || (typeof entry1.nearAction === "boolean"))
    && (!("redundantSignal" in entry1) || entry1.redundantSignal === undefined || (typeof entry1.redundantSignal === "boolean"))
    && (!("signalChannels" in entry1) || entry1.signalChannels === undefined || (Array.isArray(entry1.signalChannels) && entry1.signalChannels.every((entry2: unknown) => (entry2 === "visual" || entry2 === "audio" || entry2 === "haptic" || entry2 === "text"))))
    && (!("reliesOnColorAlone" in entry1) || entry1.reliesOnColorAlone === undefined || (typeof entry1.reliesOnColorAlone === "boolean"))
    && (!("reliesOnAudioAlone" in entry1) || entry1.reliesOnAudioAlone === undefined || (typeof entry1.reliesOnAudioAlone === "boolean"))
    && (!("telegraphReadable" in entry1) || entry1.telegraphReadable === undefined || (typeof entry1.telegraphReadable === "boolean"))
    && (!("requiredResponseObvious" in entry1) || entry1.requiredResponseObvious === undefined || (typeof entry1.requiredResponseObvious === "boolean"))
    && (!("futurePathVisible" in entry1) || entry1.futurePathVisible === undefined || (typeof entry1.futurePathVisible === "boolean"))
    && (!("readableUnderMotion" in entry1) || entry1.readableUnderMotion === undefined || (typeof entry1.readableUnderMotion === "boolean"))))))
    && (!("stressFrames" in value) || value.stressFrames === undefined || (Array.isArray(value.stressFrames) && value.stressFrames.every((entry3: unknown) => (typeof entry3 === "object" && entry3 !== null && !Array.isArray(entry3)
    && (!("moment" in entry3) || entry3.moment === undefined || (typeof entry3.moment === "string"))
    && (!("clutterSource" in entry3) || entry3.clutterSource === undefined || (typeof entry3.clutterSource === "string"))
    && (!("cueMasked" in entry3) || entry3.cueMasked === undefined || (typeof entry3.cueMasked === "boolean"))
    && (!("criticalInfoLost" in entry3) || entry3.criticalInfoLost === undefined || (typeof entry3.criticalInfoLost === "boolean"))
    && (!("responseStillReadable" in entry3) || entry3.responseStillReadable === undefined || (typeof entry3.responseStillReadable === "boolean"))
    && (!("tags" in entry3) || entry3.tags === undefined || (Array.isArray(entry3.tags) && entry3.tags.every((entry4: unknown) => typeof entry4 === "string")))
    && (!("framePath" in entry3) || entry3.framePath === undefined || (typeof entry3.framePath === "string"))))))
    && (!("competitionMoments" in value) || value.competitionMoments === undefined || (Array.isArray(value.competitionMoments) && value.competitionMoments.every((entry5: unknown) => (typeof entry5 === "object" && entry5 !== null && !Array.isArray(entry5)
    && (!("moment" in entry5) || entry5.moment === undefined || (typeof entry5.moment === "string"))
    && (!("signals" in entry5) || entry5.signals === undefined || (Array.isArray(entry5.signals) && entry5.signals.every((entry6: unknown) => typeof entry6 === "string")))
    && (!("dominantReadClear" in entry5) || entry5.dominantReadClear === undefined || (typeof entry5.dominantReadClear === "boolean"))
    && (!("responsePriorityClear" in entry5) || entry5.responsePriorityClear === undefined || (typeof entry5.responsePriorityClear === "boolean"))
    && (!("nonCriticalUiCompeting" in entry5) || entry5.nonCriticalUiCompeting === undefined || (typeof entry5.nonCriticalUiCompeting === "boolean"))))))
    && (!("ephemeralMoments" in value) || value.ephemeralMoments === undefined || (Array.isArray(value.ephemeralMoments) && value.ephemeralMoments.every((entry7: unknown) => (typeof entry7 === "object" && entry7 !== null && !Array.isArray(entry7)
    && (!("name" in entry7) || entry7.name === undefined || (typeof entry7.name === "string"))
    && (!("kind" in entry7) || entry7.kind === undefined || (typeof entry7.kind === "string"))
    && (!("autoDismisses" in entry7) || entry7.autoDismisses === undefined || (typeof entry7.autoDismisses === "boolean"))
    && (!("reviewableLater" in entry7) || entry7.reviewableLater === undefined || (typeof entry7.reviewableLater === "boolean"))
    && (!("suppressibleWhenNonCritical" in entry7) || entry7.suppressibleWhenNonCritical === undefined || (typeof entry7.suppressibleWhenNonCritical === "boolean"))
    && (!("obstructsCriticalRead" in entry7) || entry7.obstructsCriticalRead === undefined || (typeof entry7.obstructsCriticalRead === "boolean"))))))
    && (!("beats" in value) || value.beats === undefined || (Array.isArray(value.beats) && value.beats.every((entry8: unknown) => (typeof entry8 === "object" && entry8 !== null && !Array.isArray(entry8)
    && (!("at" in entry8) || entry8.at === undefined || (typeof entry8.at === "string"))
    && (!("label" in entry8) || entry8.label === undefined || (typeof entry8.label === "string"))
    && (!("activeDemands" in entry8) || entry8.activeDemands === undefined || (typeof entry8.activeDemands === "number" && Number.isFinite(entry8.activeDemands)))
    && (!("newDemands" in entry8) || entry8.newDemands === undefined || (typeof entry8.newDemands === "number" && Number.isFinite(entry8.newDemands)))
    && (!("stackReadable" in entry8) || entry8.stackReadable === undefined || (typeof entry8.stackReadable === "boolean"))))))
    && (!("probeOutcomes" in value) || value.probeOutcomes === undefined || (Array.isArray(value.probeOutcomes) && value.probeOutcomes.every((entry9: unknown) => (typeof entry9 === "object" && entry9 !== null && !Array.isArray(entry9)
    && (!("probe" in entry9) || entry9.probe === undefined || (typeof entry9.probe === "string"))
    && (!("outcome" in entry9) || entry9.outcome === undefined || (typeof entry9.outcome === "string"))
    && (!("confidence" in entry9) || entry9.confidence === undefined || (typeof entry9.confidence === "number" && Number.isFinite(entry9.confidence)))
    && (!("satisfaction" in entry9) || entry9.satisfaction === undefined || (typeof entry9.satisfaction === "number" && Number.isFinite(entry9.satisfaction)))
    && (!("frustration" in entry9) || entry9.frustration === undefined || (typeof entry9.frustration === "number" && Number.isFinite(entry9.frustration)))
    && (!("blockers" in entry9) || entry9.blockers === undefined || (Array.isArray(entry9.blockers) && entry9.blockers.every((entry10: unknown) => typeof entry10 === "string")))))))
    && (!("strengths" in value) || value.strengths === undefined || (Array.isArray(value.strengths) && value.strengths.every((entry11: unknown) => typeof entry11 === "string")))
    && (!("frictions" in value) || value.frictions === undefined || (Array.isArray(value.frictions) && value.frictions.every((entry12: unknown) => typeof entry12 === "string"))));
}
